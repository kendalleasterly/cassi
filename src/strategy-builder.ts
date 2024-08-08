import { last } from "cheerio/lib/api/traversing";
import { OptionChain, OptionLeg } from "./html-parser"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import * as mathjs from 'mathjs';

const RISK_FREE_RATE = 3.78 / 100

class StrategyBuilder {

    stdDev: number

    constructor(
        public currentPrice: number,
        public IV: number,
        public timeToExp: number,
        public putOptions: {[key: number]: OptionLeg},
        public callOptions: {[key: number]: OptionLeg},
        public maxCollateral: number
    ) {
        this.stdDev = currentPrice * IV * Math.sqrt(timeToExp)
    }

    isInBounds(strikePrice: number): boolean {
        const lowerBound = this.currentPrice - this.stdDev * 4
        const upperBound = this.currentPrice + this.stdDev * 4

        return strikePrice <= upperBound && strikePrice >= lowerBound
    }
    

    //
    findBestCreditSpread(limit: number): EvalResult[] {

        let allStratagies: EvalResult[] = [];

        [this.putOptions, this.callOptions].forEach((optionLegsDict) => {

            const optionLegs = Object.values(optionLegsDict)
            const type = optionLegs[0].type

            optionLegs.forEach((shortLeg, _) => {
                if (!this.isInBounds(shortLeg.strike)) return
        
                // then loop through all the potential LONG put options inside, only combining the LONG puts that are strictly lower than the SHORT put options
                
                optionLegs.forEach((longLeg, _) => {
        
                    // if (!longLeg.isOTM) { //doesn't need to be OTM rn, but should be decently close
                    //     return
                    // }
                    if (!this.isInBounds(longLeg.strike)) return
        
                    if ((type == "put" && longLeg.strike >= shortLeg.strike) || (type == "call" && shortLeg.strike >= longLeg.strike)) return
    
        
                    const strategy: CreditSpread = {shortLeg, longLeg, type}
    
                    let templateEvalResult = StrategyEvaluator.evaluateCreditSpread(strategy, this.maxCollateral) // we do this to easily get the max collateral
    
                    if (templateEvalResult.collateral > this.maxCollateral) {
                        return
                    }
    
                    const {totalMarkValue, totalNaturalValue} = this.gammaAdjustmentForTrueExpectedValue(strategy)
    
                    templateEvalResult.markExpectedVal = totalMarkValue
                    templateEvalResult.naturalExpectedVal = totalNaturalValue
    
                    
                    allStratagies.push(templateEvalResult)  
                    
                    
                        
                    
                })
            })
        })

        return allStratagies
    
    }
    
    findBestIronCondor(limit:number): EvalResult[] {
        // try not to restrict or filter the options it gives you, because if it is resellient and thinks its timed right, it should be logical enough
    
        const putOptionArray = Object.values(this.putOptions)
        const callOptionArray = Object.values(this.callOptions)
    
        let allStratagies: EvalResult[] = []
    
        putOptionArray.forEach((longPut, _) => {

            console.log(longPut.strike)
            if (!this.isInBounds(longPut.strike)) return
    
            putOptionArray.forEach((shortPut, _) => {
    
                if (shortPut.strike <= longPut.strike) return
                if ((shortPut.strike - longPut.strike) * 100 > this.maxCollateral) return
                if (!this.isInBounds(shortPut.strike)) return

                console.log(shortPut.strike)
    
                callOptionArray.forEach((shortCall, _) => {
    
                    if (shortCall.strike <= shortPut.strike) return
                    if (!this.isInBounds(shortCall.strike)) return
    
                    callOptionArray.forEach((longCall, _) => {
    
                        if (longCall.strike <= shortCall.strike) return
                        if ((longCall.strike - shortCall.strike) * 100 > this.maxCollateral) return
                        if (!this.isInBounds(longCall.strike)) return
    
                        const strategy: IronCondor = {longPut, shortPut, longCall, shortCall}
    
                        const {totalMarkValue, totalNaturalValue} = this.gammaAdjustmentForTrueExpectedValue(strategy)
        
                        let templateEvalResult = StrategyEvaluator.evaluateIronCondor(strategy, this.maxCollateral) // we do this to easily get the max collateral
                        templateEvalResult.markExpectedVal = totalMarkValue
                        templateEvalResult.naturalExpectedVal = totalNaturalValue
        
                        
                        allStratagies.push(templateEvalResult)  
                        
                    })
                })
            })
        })
    
        return allStratagies
    }
    
    getTopNaturalAndMark(allStratagies: EvalResult[], limit: number) {
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
    
    
    // - - - MARK: Gamma Zone - - - 
    
    /**
     * uses the target price to find a Euler approximation for the new probabilties (by using each gamma at each strike until you reach the center mean)
     * 
     * @param {OptionLeg} option - The option to have its probabilties simulated when at the target price
     * @param {number} meanPrice - The current price of the stock (provides context to know how far we need to go to target price)
     * @param {{[key: number]: OptionLeg}} putOptions - All of the put options on the option chain (used for euler approximation of new probabilties)
     * @param {{[key: number]: OptionLeg}} callOptions - All of the call options on the option chain (used for euler approximation of new probabilties)
     * @returns {OptionLeg} The new Option Leg with the simulated probabilities
     */
    gammaSimulation(option: OptionLeg, targetPrice: number): OptionLeg {
    
        let strikes: number[] = [] // must sort bc unsorted won't return min distance between strikes
        Object.values(this.putOptions).forEach((optionLeg) => {
            strikes.push(optionLeg.strike)
        })
    
        strikes.sort((a, b) => {
            return a - b
        })
    
        const strikeDistance = Math.abs(strikes[0] - strikes[1]) // widths can be different on the same chain
        const distanceToTarget = targetPrice - this.currentPrice // directional to tell us which way to adjust
        const steps = Math.abs(distanceToTarget / strikeDistance)
        const intSteps = Math.floor(steps)
        const fractionalSteps = steps - intSteps
    
        //use the current gamma first, and then once you get to the next strike use the next strike's gamma
    
        let newProfile = {...option}
        let currentStrike = option.strike
        let strikeMissingOcurrences = 0
    
        for (let i = 0; i <= intSteps; i++) {
    
            const currentGamma = option.type == "put" ? this.putOptions[currentStrike].gamma * -1 : this.callOptions[currentStrike].gamma //put options have negative delta and pos gamma, here we'll say pos delta negative gamma)
    
            if (i == intSteps) {
                newProfile.probITM = newProfile.probITM + currentGamma * fractionalSteps * strikeDistance * Math.sign(distanceToTarget)
            } else {
                newProfile.probITM = newProfile.probITM + currentGamma * strikeDistance * Math.sign(distanceToTarget)
            }
    
            
            //decide what the next strike is, and find the distance between current and next
            const movementDirection = Math.sign(distanceToTarget) * -1 //move the profile of the strike in the opposite direction as the price, because strikes have lower-strike like profiles as the price moves up & vice versa
            const nextIndex = strikes.indexOf(currentStrike) + movementDirection
    
            if (strikes.length > nextIndex && nextIndex >= 0)  {
                
                const nextStrike = strikes[nextIndex]
    
                currentStrike = nextStrike
                
    
            } else {
                strikeMissingOcurrences+=1
                 //typically won't matter because when you get that far up/down the chain its just 99% / 1% anyways
    
                // #todo this might give more weight to certain outcomes than it should. Just try to click the more button before you send the data here. and make sure I know if i run out of strikes
                break
            }
    
            if (strikeMissingOcurrences > 0) console.log({strikeMissingOcurrences})
    
            // newProfile.gamma = option.type == "put" ? putOptions[currentStrike].gamma : callOptions[currentStrike].gamma //this was uncecessary
    
        }
        
        if (newProfile.probITM < 0) newProfile.probITM = 0
        if (newProfile.probOTM < 0) newProfile.probOTM = 0
    
        if (newProfile.probITM > 1) newProfile.probITM = 1
        if (newProfile.probOTM > 1) newProfile.probOTM = 1
    
        newProfile.probOTM = 1 - newProfile.probITM
    
        return newProfile
    }
    
    
    
    /**
     * probabiltiy that future stock price will be between two stock price
     
     * @param {number} time - how long for the stock to reach this price (in years, 1 month = 1/12)
     * @param {number} r - The risk-free interest rate
     * @returns {number} The cumulative probability from 0 to this stock price
     */
    
    stockPriceCDF(meanPrice: number, futurePrice1: number, futurePrice2: number, r: number): number {
    
        function normCDF(x: number): number {
            return (1.0 + mathjs.erf(x / Math.sqrt(2))) / 2.0;
        }
    
        const S0 = meanPrice
        const K_1 = futurePrice1
        const K_2 = futurePrice2
        const T = this.timeToExp
        const sigma = this.IV
    
        // Calculate d2
        const d2_1 = (Math.log(K_1 / S0) - (r - 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
        const d2_2 = (Math.log(K_2 / S0) - (r - 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
        
        // Calculate the CDF value
        const cdfValue_1 = normCDF(d2_1)
        const cdfValue_2 = normCDF(d2_2)
    
        return Math.abs(cdfValue_1 - cdfValue_2);
    }
    // could've just used delta to approximate probOTM  and ITM, but wouldn't be as accurate
    // could've just used an estimation between two strikes, but that wouldn't be as accurate. Also, different strikes have slightly different prob distributions, so probabilties could have major discrepencies
    
    gammaAdjustmentForTrueExpectedValue(strategy: IronCondor | CreditSpread ): {totalMarkValue: number, totalNaturalValue: number} { //
    
        let totalMarkValue = 0
        let totalNaturalValue = 0
        let lastResultValue = -99999999;
    
        [-1, 1].forEach(direction => {
    
            for (let i = 0; i < (100000); i++) {
                const width = this.stdDev / 100 
    
                let newPrice = this.currentPrice + (width * i) * direction
                
                let adjustedProfile: {[key: string]: OptionLeg | string} = {...strategy}
        
                Object.keys(strategy).forEach(key => {
                    if (key == "type") return   // only key on either that isn't an option leg
        
                    const newLegProfile = this.gammaSimulation(adjustedProfile[key] as OptionLeg, newPrice)
        
                    adjustedProfile[key] = newLegProfile
        
                });
    
                let evalResult: EvalResult | null = null
    
                if (Object.keys(adjustedProfile).includes("type")) { //it is a credit spread
                    evalResult = StrategyEvaluator.evaluateCreditSpread(adjustedProfile as CreditSpread, this.maxCollateral)
                } else {
                    evalResult = StrategyEvaluator.evaluateIronCondor(adjustedProfile as IronCondor, this.maxCollateral)
                }
        
                
                
                const probArea = this.stockPriceCDF(this.currentPrice, newPrice + direction * width, newPrice, RISK_FREE_RATE)
                const expectedMarkValue = probArea * evalResult.markExpectedVal
                const expectedNaturalValue = probArea * evalResult.naturalExpectedVal
                // console.log({newPrice, expectedValue}, evalResult.markExpectedVal)
                totalMarkValue+=expectedMarkValue
                totalNaturalValue += expectedNaturalValue
        
                // console.log({newPrice, expectedValue, probArea}, evalResult.markExpectedVal)
                if (lastResultValue == evalResult.markExpectedVal) {
                    // console.log("- - -  expected reached max value - - - ")
                    break
                }
        
                lastResultValue = evalResult.markExpectedVal
                
            }
        
            // console.log({totalValue: totalMarkValue})
        })
    
        return {totalMarkValue, totalNaturalValue}
    
        
    }

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

export {CreditSpread, IronCondor, StrategyBuilder}