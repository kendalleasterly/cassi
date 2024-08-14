import { last } from "cheerio/lib/api/traversing";
import { OptionChain, OptionLeg } from "./html-parser"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import * as mathjs from 'mathjs';

const RISK_FREE_RATE = 5.5 / 100

class StrategyBuilder {

    stdDevPrice: number
    strategiesEvaluatedVol: number = 0
    strategiesEvaluatedStockPrice: number = 0

    constructor(
        public currentPrice: number,
        public meanVolatility: number,
        public meanLogVol: number,
        public stdDevLogVol: number,
        public timeToExp: number,
        public putOptions: {[key: number]: OptionLeg},
        public callOptions: {[key: number]: OptionLeg},
        public maxLoss: number,
        public maxCollateral: number
    ) {
        this.stdDevPrice = currentPrice * meanVolatility * Math.sqrt(timeToExp) // already converted to the time period

    }

    getVolatilityExpectedValue(strategy: IronCondor | CreditSpread): {expectedMarkValue: number, expectedNaturalValue: number} {

        this.strategiesEvaluatedVol++
        
        let expectedMarkVal = 0
        let expectedNaturalVal = 0

        const width = this.stdDevLogVol * .25;
        const steps = 13;

        [-1, 1].forEach(direction => {

            let expectedVals: {[key: number]: {newLogVol: number, totalMarkValue: number, totalNaturalValue: number, probArea: number}} = {} // volatility : E(x) at that volatility

            for (let i = 0; i < steps; i++) {
                const newLogVol = this.meanLogVol + (width * direction) * i

                const nextVolatility = newLogVol + (width * direction) 
                
                const z_1 = (this.meanLogVol - newLogVol) / this.stdDevLogVol
                const z_2 = (this.meanLogVol - nextVolatility) / this.stdDevLogVol

                let probArea = Math.abs(this.normCDF(z_1) - this.normCDF(z_2))

                const newVol = Math.exp(newLogVol)

                //todo: use an index instead of using the actual value. the computer is saying -2.4083189802728207 ≠ -2.408318980272821
                expectedVals[i] = {...this.getStockPriceExpectedValue(strategy, newVol), newLogVol, probArea}
            }

            Object.keys(expectedVals).forEach(indexString => {

                let i = Number(indexString)
                const currLogVol = this.meanLogVol + (width * direction) * i
                if (currLogVol !== expectedVals[i].newLogVol) {
                    console.log(" - - - - - ERRORR - - - - -")
                    console.log(currLogVol, "≠", expectedVals[i].newLogVol)
                }

                if (i == steps - 1) return

                const nextVolExpectedVals = expectedVals[i + 1]
                
                expectedMarkVal += ((expectedVals[i].totalMarkValue + nextVolExpectedVals.totalMarkValue) / 2) * expectedVals[i].probArea
                
                expectedNaturalVal += ((expectedVals[i].totalNaturalValue + nextVolExpectedVals.totalNaturalValue) / 2) * expectedVals[i].probArea

            })
            
        })

        
        return {expectedMarkValue: expectedMarkVal, expectedNaturalValue: expectedNaturalVal}

    }


    isInBounds(strikePrice: number): boolean {
        const lowerBound = this.currentPrice - this.stdDevPrice * 5
        const upperBound = this.currentPrice + this.stdDevPrice * 5

        return strikePrice <= upperBound && strikePrice >= lowerBound
    }
    

    //
    findBestCreditSpread(): EvalResult[] {

        let allStratagies: EvalResult[] = [];

        [this.putOptions, this.callOptions].forEach((optionLegsDict) => {

            const optionLegs = Object.values(optionLegsDict)
            const type = optionLegs[0].type

            optionLegs.forEach((shortLeg, _) => {
                
                if (!this.isInBounds(shortLeg.strike)) return
                
                
                optionLegs.forEach((longLeg, _) => {
        
                    if (!this.isInBounds(longLeg.strike)) return
        
                    if ((type == "put" && longLeg.strike >= shortLeg.strike) || (type == "call" && shortLeg.strike >= longLeg.strike)) return
    
        
                    const strategy: CreditSpread = {shortLeg, longLeg, type}
    
                    let templateEvalResult = StrategyEvaluator.evaluateCreditSpread(strategy, this.maxCollateral, this.maxLoss) // we do this to easily get the max collateral
    
                    if (templateEvalResult.collateral > this.maxCollateral) return
                    if (templateEvalResult.mark.maxLoss > this.maxLoss) return
                    
                    const {expectedMarkValue: totalMarkValue, expectedNaturalValue: totalNaturalValue} = this.getVolatilityExpectedValue(strategy)
    
                    templateEvalResult.mark.expectedValue = totalMarkValue
                    templateEvalResult.natural.expectedValue = totalNaturalValue
    
                    
                    allStratagies.push(templateEvalResult)  
                    
                })
            })
        })

        return allStratagies
    
    }
    
    findBestIronCondor(startingLongPuts: OptionLeg[]): EvalResult[] {
        // try not to restrict or filter the options it gives you, because if it is resellient and thinks its timed right, it should be logical enough
    
        const putOptionArray = Object.values(this.putOptions)
        const callOptionArray = Object.values(this.callOptions)
    
        let allStratagies: EvalResult[] = []
    
        startingLongPuts.forEach((longPut, _) => {
            
            if (!this.isInBounds(longPut.strike)) return
            
            putOptionArray.forEach((shortPut, _) => {
    
                if (shortPut.strike <= longPut.strike) return
                if ((shortPut.strike - longPut.strike) * 100 > this.maxCollateral) return
                if (!this.isInBounds(shortPut.strike)) return
                
                callOptionArray.forEach((shortCall, _) => {
    
                    if (shortCall.strike <= shortPut.strike) return
                    if (!this.isInBounds(shortCall.strike)) return

                    
                    callOptionArray.forEach((longCall, _) => {
                        
                        if (longCall.strike <= shortCall.strike) return
                        if (!this.isInBounds(longCall.strike)) return
                        
    
                        const strategy: IronCondor = {longPut, shortPut, longCall, shortCall}

                        let templateEvalResult = StrategyEvaluator.evaluateIronCondor(strategy, this.maxCollateral, this.maxLoss)

                        if (templateEvalResult.collateral > this.maxCollateral) return
                        if (templateEvalResult.mark.maxLoss > this.maxLoss) return
    
                        const {expectedMarkValue, expectedNaturalValue} = this.getVolatilityExpectedValue(strategy)
        
                        
                        templateEvalResult.mark.expectedValue = expectedMarkValue
                        templateEvalResult.natural.expectedValue = expectedNaturalValue

                        allStratagies.push(templateEvalResult)
                        
                    })
                })
            })
        })
    
        return allStratagies
    }

    /**
     * 
     * @param {OptionLeg} option - The option to have its probabilties simulated when at the target price
     * @param {number} newPrice - The simulated price of the stock (provides context to know how far we need to go to target price)
     * @returns {OptionLeg} The new option leg profile with the simulated probabilities
     */
    simulateProfile(option: OptionLeg, newPrice: number, volatility: number): OptionLeg {

        let newProfile = option
        
        newProfile.probITM = this.stockPriceCDF(newPrice, volatility, option.type == "put" ? 0 : 9999999999, newProfile.strike, RISK_FREE_RATE)
        newProfile.probOTM = 1 - newProfile.probITM
        

        return newProfile
    }
    
    normCDF(z: number): number {
        return (1.0 + mathjs.erf(z / Math.sqrt(2))) / 2.0;
    }
    
    /**
     * probabiltiy that future stock price will be between two stock price
     
     * @param {number} time - how long for the stock to reach this price (in years, 1 month = 1/12)
     * @param {number} r - The risk-free interest rate
     * @returns {number} The cumulative probability from 0 to this stock price
     */
    
    stockPriceCDF(meanPrice: number,  volatility: number, futurePrice1: number, futurePrice2: number, r: number): number {
    
        const S0 = meanPrice
        const K_1 = futurePrice1
        const K_2 = futurePrice2
        const T = this.timeToExp
        const sigma = volatility //is passed in for volatility during the time period, need to convert back to volatility for the year
    
        // Calculate d2
        const d2_1 = (Math.log(K_1 / S0) - (r - 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
        const d2_2 = (Math.log(K_2 / S0) - (r - 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
        
        // Calculate the CDF value
        const cdfValue_1 = this.normCDF(d2_1)
        const cdfValue_2 = this.normCDF(d2_2)
    
        return Math.abs(cdfValue_1 - cdfValue_2);
    }
    
    getStockPriceExpectedValue(strategy: IronCondor | CreditSpread, volatility: number ): {totalMarkValue: number, totalNaturalValue: number} { //
    
        this.strategiesEvaluatedStockPrice++

        let totalMarkValue = 0
        let totalNaturalValue = 0
        let lastResultValue = -99999999;
    
        [-1, 1].forEach(direction => {

            // This speeds up runs with higher volatilites, as these runs will evaluate more legs. So the larger the mean volatility, the larger the width (and the less accurate).
            const widthFactor = this.meanVolatility / 23 // 20 is just some arbitrary value that I chose to scale the proportion by (.2 / 20 = 0.01 or 1 one-hundreth of a standard deviation)
            const width = this.stdDevPrice * widthFactor // 
    
            for (let i = 0; i < ((1 / widthFactor) * 8); i++) { // 10 stdDevs in both directions
    
                let newPrice = this.currentPrice + (width * i) * direction
                if (newPrice <= 0) break
                
                let adjustedProfile: {[key: string]: OptionLeg | string} = {...strategy}
        
                Object.keys(strategy).forEach(key => {
                    if (key == "type") return  
        
                    const newLegProfile = this.simulateProfile(adjustedProfile[key] as OptionLeg, newPrice, volatility) 
        
                    adjustedProfile[key] = newLegProfile
        
                });

                let evalResult: EvalResult | null = null
    
                if (Object.keys(adjustedProfile).includes("type")) { //it is a credit spread
                    evalResult = StrategyEvaluator.evaluateCreditSpread(adjustedProfile as CreditSpread, this.maxCollateral, this.maxLoss)
                } else {
                    evalResult = StrategyEvaluator.evaluateIronCondor(adjustedProfile as IronCondor, this.maxCollateral, this.maxLoss)
                }
                
                const probArea = this.stockPriceCDF(this.currentPrice, volatility, newPrice + direction * width, newPrice, RISK_FREE_RATE)
                const expectedMarkValue = probArea * evalResult.mark.expectedValue
                const expectedNaturalValue = probArea * evalResult.natural.expectedValue

                totalMarkValue+=expectedMarkValue
                totalNaturalValue += expectedNaturalValue
        
                if (lastResultValue == evalResult.mark.expectedValue) {
                    break
                }
        
                lastResultValue = evalResult.mark.expectedValue
                
            }
        
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

function getTopResults(allStratagies: EvalResult[], limit: number) {
    let topNaturalResults = [...allStratagies]
    let topMarkResults = [...allStratagies]

    topNaturalResults.sort((a, b) => {
        return b.natural.expectedValue - a.natural.expectedValue
    })

    topMarkResults.sort((a, b) => {
        return b.mark.expectedValue - a.mark.expectedValue
    })

    topNaturalResults = topNaturalResults.slice(0, limit)
    topMarkResults = topMarkResults.slice(0, limit)

    return {topNaturalResults, topMarkResults}
}

export {CreditSpread, IronCondor, StrategyBuilder, getTopResults}











// - - - Mark: Old Functions

    
    // /**
    //  * uses the target price to find a Euler approximation for the new probabilties (by using each gamma at each strike until you reach the center mean)
    //  * 
    //  * @param {OptionLeg} option - The option to have its probabilties simulated when at the target price
    //  * @param {number} meanPrice - The current price of the stock (provides context to know how far we need to go to target price)
    //  * @param {{[key: number]: OptionLeg}} putOptions - All of the put options on the option chain (used for euler approximation of new probabilties)
    //  * @param {{[key: number]: OptionLeg}} callOptions - All of the call options on the option chain (used for euler approximation of new probabilties)
    //  * @returns {OptionLeg} The new Option Leg with the simulated probabilities
    //  */
    // gammaSimulation(option: OptionLeg, targetPrice: number): OptionLeg {
    
    //     let strikes: number[] = [] // must sort bc unsorted won't return min distance between strikes
    //     Object.values(this.putOptions).forEach((optionLeg) => {
    //         strikes.push(optionLeg.strike)
    //     })
    
    //     strikes.sort((a, b) => {
    //         return a - b
    //     })
    
    //     const strikeDistance = Math.abs(strikes[0] - strikes[1]) // widths can be different on the same chain
    //     const distanceToTarget = targetPrice - this.currentPrice // directional to tell us which way to adjust
    //     const steps = Math.abs(distanceToTarget / strikeDistance)
    //     const intSteps = Math.floor(steps)
    //     const fractionalSteps = steps - intSteps
    
    //     //use the current gamma first, and then once you get to the next strike use the next strike's gamma
    
    //     let newProfile = {...option}
    //     let currentStrike = option.strike
    //     let strikeMissingOcurrences = 0
    
    //     for (let i = 0; i <= intSteps; i++) {
    
    //         const currentGamma = option.type == "put" ? this.putOptions[currentStrike].gamma * -1 : this.callOptions[currentStrike].gamma //put options have negative delta and pos gamma, here we'll say pos delta negative gamma)
    
    //         if (i == intSteps) {
    //             newProfile.probITM = newProfile.probITM + currentGamma * fractionalSteps * strikeDistance * Math.sign(distanceToTarget)
    //         } else {
    //             newProfile.probITM = newProfile.probITM + currentGamma * strikeDistance * Math.sign(distanceToTarget)
    //         }
    
            
    //         //decide what the next strike is, and find the distance between current and next
    //         const movementDirection = Math.sign(distanceToTarget) * -1 //move the profile of the strike in the opposite direction as the price, because strikes have lower-strike like profiles as the price moves up & vice versa
    //         const nextIndex = strikes.indexOf(currentStrike) + movementDirection
    
    //         if (strikes.length > nextIndex && nextIndex >= 0)  {
                
    //             const nextStrike = strikes[nextIndex]
    
    //             currentStrike = nextStrike
                
    
    //         } else {
    //             strikeMissingOcurrences+=1
    //              //typically won't matter because when you get that far up/down the chain its just 99% / 1% anyways
    
    //             // #todo this might give more weight to certain outcomes than it should. Just try to click the more button before you send the data here. and make sure I know if i run out of strikes
    //             break
    //         }
    
    //         if (strikeMissingOcurrences > 0) console.log({strikeMissingOcurrences})
    
    //         // newProfile.gamma = option.type == "put" ? putOptions[currentStrike].gamma : callOptions[currentStrike].gamma //this was uncecessary
    
    //     }
        
    //     if (newProfile.probITM < 0) newProfile.probITM = 0
    //     if (newProfile.probOTM < 0) newProfile.probOTM = 0
    
    //     if (newProfile.probITM > 1) newProfile.probITM = 1
    //     if (newProfile.probOTM > 1) newProfile.probOTM = 1
    
    //     newProfile.probOTM = 1 - newProfile.probITM
    
    //     return newProfile
    // }