import { OptionChain, OptionLeg } from "./html-parser"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"


function findBestCreditSpread(optionLegs: OptionLeg[], type: "put" | "call", maxCollateral: number, limit: number): {topNaturalStrategies: EvalResult[], topMarkStrategies: EvalResult[]} {

    let allStratagies: EvalResult[] = []

    //loop through all the potential SHORT put options

    optionLegs.forEach((shortLeg, _) => {

        // then loop through all the potential LONG put options inside, only combining the LONG puts that are strictly lower than the SHORT put options

        // if (!shortLeg.isOTM) {
        //     return
        // }
        
        optionLegs.forEach((longLeg, _) => {

            // if (!longLeg.isOTM) {
            //     return
            // }

            if ((type == "put" && longLeg.strike < shortLeg.strike) || (type == "call" && shortLeg.strike < longLeg.strike)) {

                const evalResult = StrategyEvaluator.evaluateCreditSpread({shortLeg, longLeg, type}, maxCollateral)

                if (evalResult.collateral <= maxCollateral) {

                    allStratagies.push(evalResult)
                }
            }
        })

    })

    return getTopNaturalAndMark(allStratagies, limit)

}

function findBestIronCondor(putOptions: OptionLeg[], callOptions: OptionLeg[], maxCollateral: number, limit:number): {topNaturalStrategies: EvalResult[], topMarkStrategies: EvalResult[]} {
    // try not to restrict or filter the options it gives you, because if it is resellient and thinks its timed right, it should be logical enough


    let allStratagies: EvalResult[] = []

    putOptions.forEach((longPut, _) => {
        

        putOptions.forEach((shortPut, _) => {
                

                callOptions.forEach((shortCall, _) => {


                    callOptions.forEach((longCall, _) => {

                        // The following could've been dispersed in parent loops, but I'm less worried about speed and more focused on code readability. 

                        // if (shortPut.strike > 157.5) return
                        // if (shortCall.strike < 170) return

                        // if (longPut.strike >= shortPut.strike) return
                        // if (shortCall.strike >= longCall.strike) return


                        const evalResult = StrategyEvaluator.evaluateIronCondor({longPut, shortPut, longCall, shortCall}, maxCollateral)
                        allStratagies.push(evalResult)

                    })
                })
        })
    })

    return getTopNaturalAndMark(allStratagies, limit)
}

function getTopNaturalAndMark(allStratagies: EvalResult[], limit: number) {
    let topNaturalStrategies = [...allStratagies]
    let topMarkStrategies = [...allStratagies]

    topNaturalStrategies.sort((a, b) => {
        return b.naturalExpectedVal - a.naturalExpectedVal
    })

    topMarkStrategies.sort((a, b) => {
        return b.markExpectedVal - a.markExpectedVal
    })

    topNaturalStrategies = topNaturalStrategies.slice(0, limit)
    topMarkStrategies = topMarkStrategies.slice(0, limit)
    
    console.log("- - - NATURAL - - - ")
    topNaturalStrategies.forEach((strat, _) => console.log(strat))
    console.log("- - - MARK - - - ")
    topMarkStrategies.forEach((strat, _) => console.log(strat))

    return {topNaturalStrategies, topMarkStrategies}
}


/**
 * uses the target price to find a Euler approximation for the new probabilties (by using each gamma at each strike until you reach the center mean)
 * 
 * @param {OptionLeg} option - The option to have its probabilties simulated when at the target price
 * @param {number} currentPrice - The current price of the stock (provides context to know how far we need to go to target price)
 * @param {{[key: number]: OptionLeg}} putOptions - All of the put options on the option chain (used for euler approximation of new probabilties)
 * @param {{[key: number]: OptionLeg}} callOptions - All of the call options on the option chain (used for euler approximation of new probabilties)
 * @returns { OptionLeg} The new Option Leg with the simulated probabilities
 */
function gammaSimulation(option: OptionLeg, currentPrice: number, targetPrice: number, optionChan: OptionChain): OptionLeg {

    const {putOptions, callOptions} = optionChan

    const putArray = Object.values(putOptions).sort((a, b) => { return a.strike - b.strike }) // must sort bc unsorted won't return min distance between strikes

    const strikeDistance = Math.abs(putArray[0].strike - putArray[1].strike)

    const distanceToTarget = targetPrice - currentPrice // directional to tell us which way to adjust
    

    const steps = Math.abs(distanceToTarget / strikeDistance)
    const intSteps = Math.floor(steps)
    const fractionalSteps = steps - intSteps

    //use the current gamma first, and then once you get to the next strike use the next strike's gamma

    let newProfile = {...option}
    let currentStrike = option.strike

    for (let i = 0; i <= intSteps; i++) {

        const currentGamma = option.type == "put" ? putOptions[currentStrike].gamma * -1 : callOptions[currentStrike].gamma //put options have negative delta and pos gamma, here we'll say pos delta negative gamma)

        if (i == intSteps) {
            newProfile.probITM = newProfile.probITM + currentGamma * fractionalSteps * strikeDistance * Math.sign(distanceToTarget)
        } else {
            newProfile.probITM = newProfile.probITM + currentGamma * strikeDistance * Math.sign(distanceToTarget)
        }

        currentStrike += strikeDistance * Math.sign(distanceToTarget) * -1 //move the profile of the strike in the opposite direction as the price, because strikes have lower-strike like profiles as the price moves up & vice versa

        if (!Object.keys(putOptions).includes(String(currentStrike))) {
            console.log("- - - ERROR: RAN OUT OF STRIKES - - - ") //typically won't matter because when you get that far up/down the chain its just 99% / 1% anyways
            break
        }

        newProfile.gamma = option.type == "put" ? putOptions[currentStrike].gamma : callOptions[currentStrike].gamma 

    }

    
    if (newProfile.probITM < 0) newProfile.probITM = 0
    if (newProfile.probOTM > 1) newProfile.probITM = 1

    newProfile.probOTM = 1 - newProfile.probITM

    return newProfile
}
// could've just used delta to approximate probOTM  and ITM, but wouldn't be as accurate
// could've just used an estimation between two strikes, but that wouldn't be as accurate. Also, different strikes have slightly different prob distributions, so probabilties could have major discrepencies

function gammaAdjustmentForResilience(strategy: IronCondor | CreditSpread, currentStockPrice: number, stdDev: number, stdDevDistance: number, optionChain: OptionChain ): {lower: IronCondor | CreditSpread, upper: IronCondor | CreditSpread} { //

    const newPriceLower = currentStockPrice - (stdDev * stdDevDistance)
    const newPriceUpper = currentStockPrice + (stdDev * stdDevDistance)

    let adustedLower: {[key: string]: OptionLeg | string} = {...strategy} // need to copy or else data get corrupted
    let adjustedUpper: {[key: string]: OptionLeg | string} = {...strategy}

    Object.keys(strategy).forEach(key => {
        if (key == "type") return   // only key on either that isn't an option leg

        const lowerProfile = gammaSimulation(adustedLower[key] as OptionLeg, currentStockPrice, newPriceLower, optionChain)
        const upperProfile = gammaSimulation(adjustedUpper[key] as OptionLeg, currentStockPrice, newPriceUpper, optionChain)
        
        adustedLower[key] = lowerProfile
        adjustedUpper[key] = upperProfile

    });

    return {lower: adustedLower as IronCondor | CreditSpread, upper: adjustedUpper as IronCondor | CreditSpread}
}

function gammaAdjustmentForTiming(strategy: IronCondor | CreditSpread, meanStockPrice: number, optionChain: OptionChain): IronCondor | CreditSpread { 
    // Find the 50 period 15min SMA, use that as the center mean
    

    // return StrategyEvaluator.evaluateIronCondor(strategy)
    return strategy

}
 
type CreditSpread =  {
    shortLeg: OptionLeg
    longLeg: OptionLeg
    type: "put" | "call"
}

type IronCondor = {
    longPut: OptionLeg
    shortPut: OptionLeg
    shortCall: OptionLeg
    longCall: OptionLeg
    
}

// type ShortPut = Strategy & {
//     shortPut: OptionLeg
// }

const StrategyBuilder = {findBestCreditSpread, findBestIronCondor, gammaSimulation, gammaAdjustmentForResilience}

export {CreditSpread, IronCondor, StrategyBuilder}