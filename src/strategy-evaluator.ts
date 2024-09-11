import { OptionLeg } from "./html-parser";
import { CreditSpread, IronCondor } from "./strategy-builder";
import * as mathjs from 'mathjs';

const RISK_FREE_RATE = 5.5 / 100

class StrategyEvaluator {

    stdDevPrice: number
    strategiesEvaluatedVol: number = 0


    constructor(
        public currentPrice: number,
        public meanVolatility: number,
        public meanLogVol: number,
        public stdDevLogVol: number,
        public timeToExp: number,
        public maxAcceptableLoss: number,
        public maxCollateral: number
    ) {
        this.stdDevPrice = currentPrice * meanVolatility * Math.sqrt(timeToExp) // already converted to the time period
        console.log({stdDevPrice: this.stdDevPrice, timeToExp, meanVolatility, currentPrice})
    }

    evaluateCreditSpread(strategy: CreditSpread, volatility: number): EvalResult {
    
        const shortLeg = strategy.shortLeg
        const longLeg = strategy.longLeg

        const collateral = Math.abs(shortLeg.strike - longLeg.strike) * 100
    
        const defaultSubResult: SubEvalResult = {
            expectedGainComponent: {prob: 0, expectedPLValue: 0},
            expectedLossComponent: {prob: 0, expectedPLValue: 0},
            breakEvens: [],
            price: 0,
            maxLoss: 0,
            quantity: 0
        }

        let result: EvalResult = {
            strategy, 
            collateral,
            mark: JSON.parse(JSON.stringify(defaultSubResult)),
            natural: JSON.parse(JSON.stringify(defaultSubResult))
        };
    
        ["natural", "mark"].forEach(pricingType => {
            
            let maxGain = 0

            if (pricingType == "natural") {
                maxGain = (shortLeg.bid - longLeg.ask) * 100 
            } else {
                const shortLegMark = (shortLeg.bid + shortLeg.ask) / 2
                const longLegMark = (longLeg.bid + longLeg.ask) / 2
    
                maxGain = (shortLegMark - longLegMark) * 100
            }
    
            const triangles = this.getTriangleExpectedReturns(shortLeg, longLeg , maxGain, volatility)

            const probMaxGain = this.stockPriceCDF(volatility, shortLeg.strike, shortLeg.type == "put" ? 9999999999 : 0)
            const probMaxLoss = this.stockPriceCDF(volatility, longLeg.strike, longLeg.type == "put" ? 0 : 9999999999)

            let maxLoss = -collateral + maxGain

            if (maxLoss >= 0) maxLoss = -1 // Sometimes max loss will be 0, as max gain can happen to be equal to collateral.


            const quantity = Math.min(Math.floor( this.maxAcceptableLoss  / maxLoss * -1), Math.floor(this.maxCollateral / collateral))
            
            // if ((quantity == 0 && Math.abs(maxLoss) < Math.abs(this.maxAcceptableLoss) && collateral < this.maxCollateral) || maxGain == 0) {
            //     console.log("FOUND ZEROS")
            
            //     console.log({quantity, volatility, maxGain, maxLoss, collateral}, this.maxAcceptableLoss, this.maxCollateral)
            // }
               
            
            const expectedGain = (probMaxGain * maxGain + triangles.expectedGain) * quantity
            const expectedLoss = (probMaxLoss * maxLoss + triangles.expectedLoss) * quantity
    
            if (volatility != 0 && (isNaN(expectedGain) || isNaN(expectedLoss))) {
                console.log("- - - NAN! - - -", {strategy, volatility})
            }

            // console.log(probMaxLoss + triangles.lossProb + triangles.gainProb + probMaxGain, probMaxLoss,triangles.lossProb, triangles.gainProb, probMaxGain )
    
            let subEvalResult: SubEvalResult = {
                quantity: quantity,
                expectedGainComponent: {expectedPLValue: expectedGain, prob: triangles.gainProb + probMaxGain},
                expectedLossComponent: {expectedPLValue: expectedLoss, prob: triangles.lossProb + probMaxLoss},
                breakEvens: [triangles.breakEven],
                maxLoss: maxLoss  * quantity,
                price: maxGain / 100
            }
            
    
            if (pricingType == "natural") {
                result.natural = subEvalResult
    
            } else {
                result.mark = subEvalResult
            }
        });
        
        return result
    
    }

    evaluateIronCondor(strategy: IronCondor, volatility: number): EvalResult {
        const longPut = strategy.longPut
        const shortPut = strategy.shortPut
        const shortCall = strategy.shortCall
        const longCall = strategy.longCall
        
        const collateral = Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike) * 100

        const defaultSubResult: SubEvalResult = {
            expectedGainComponent: {prob: 0, expectedPLValue: 0},
            expectedLossComponent: {prob: 0, expectedPLValue: 0},
            breakEvens: [],
            price: 0,
            maxLoss: 0,
            quantity: 0
        }

        let result: EvalResult = {
            strategy, 
            collateral,
            mark: JSON.parse(JSON.stringify(defaultSubResult)),
            natural: JSON.parse(JSON.stringify(defaultSubResult))
        };

        let putMaxGain = 0
        let callMaxGain = 0
        let totalMaxGain = 0;
    
        ["natural", "mark"].forEach(pricingType => {
    
            if (pricingType == "natural") {

                putMaxGain = (shortPut.bid - longPut.ask) * 100
                callMaxGain = (shortCall.bid - longCall.ask) * 100
    
            } else { // change all the values to mark using the natural ones already set
    
                putMaxGain = ( putMaxGain + (shortPut.ask - longPut.bid) * 100) / 2
                callMaxGain = ( callMaxGain + (shortCall.ask - longCall.bid) * 100) / 2
                
            }
            
            // In P/L Dollars, already multiplied by 100
            totalMaxGain = putMaxGain + callMaxGain
    
            const putTriangle = this.getTriangleExpectedReturns(shortPut, longPut, totalMaxGain, volatility)
            const callTriangle = this.getTriangleExpectedReturns(shortCall, longCall, totalMaxGain, volatility)
    
            const probMaxGain = this.stockPriceCDF(volatility, shortPut.strike, shortCall.strike)
            const expectedMaxGain = totalMaxGain * probMaxGain
            
    
            //find expected loss for call & put side
            //could be different for both sides. just find the expected loss for both sides
            const probPutMaxLoss = this.stockPriceCDF(volatility, 0, longPut.strike)
            const probCallMaxLoss = this.stockPriceCDF(volatility, longCall.strike, 999999999)
    
            const expectedPutMaxLoss = ( -(shortPut.strike - longPut.strike) * 100 + totalMaxGain) * probPutMaxLoss
            const expectedCallMaxLoss = ( -(longCall.strike - shortCall.strike) * 100 + totalMaxGain) * probCallMaxLoss
    
            let maxLoss = Math.max( -(longCall.strike - shortCall.strike) * 100 + totalMaxGain, -(shortPut.strike - longPut.strike) * 100 + totalMaxGain)
            if (maxLoss >= 0) maxLoss = -1 // Sometimes max loss will be 0, as max gain can happen to be equal to collateral.
            const quantity = Math.min(Math.floor( this.maxAcceptableLoss  / maxLoss * -1), Math.floor(this.maxCollateral / collateral))

            const expectedGain = (putTriangle.expectedGain + expectedMaxGain + callTriangle.expectedGain) * quantity
            const expectedLoss = (expectedPutMaxLoss + putTriangle.expectedLoss + callTriangle.expectedLoss + expectedCallMaxLoss) * quantity

            const probGain = putTriangle.gainProb + probMaxGain + callTriangle.gainProb
            const probLoss = probPutMaxLoss + putTriangle.lossProb + callTriangle.lossProb + probCallMaxLoss
    
            if (volatility != 0 && (isNaN(expectedGain) || isNaN(expectedLoss) || isNaN(quantity))) {
                console.error("Expected return or quantity was NAN", {strategy})
            }
    
            let subEvalResult: SubEvalResult = {
                quantity: quantity,
                expectedGainComponent: {expectedPLValue: expectedGain, prob: probGain},
                expectedLossComponent: {expectedPLValue: expectedLoss, prob: probLoss},
                breakEvens: [Math.min(putTriangle.breakEven, callTriangle.breakEven), Math.max(putTriangle.breakEven, callTriangle.breakEven)],
                price: totalMaxGain / 100,
                maxLoss: maxLoss * quantity
            }
    
            if (pricingType == "natural") {
                result.natural = subEvalResult
            } else {
                result.mark = subEvalResult
            }
        });
        
        return result
    }

    /** 
    * Uses a Reimann sum to calculate an expected value of the triangles in between strikes
    * 
    * @param {number} maxGain In P/L Dollars, Already multiplied by 100. Per 100 Shares, or 1 contract
    **/
    private getTriangleExpectedReturns(shortLeg: OptionLeg, longLeg: OptionLeg, maxGain: number, volatility: number ): {expectedGain: number, gainProb: number, expectedLoss: number, lossProb: number, breakEven: number} {
        //find the breakeven

        const type = shortLeg.type

        const breakEven = shortLeg.strike + (maxGain) * (type == "put" ? -1 : 1) / 100 // division by 100 to caclulate the max gain per share

        // 10 slices per triagngle, two triangles: one on either side of the breakeven
        let expectedGain = 0
        let expectedLoss = 0

        //TODO: Delete the folloiwng:
        let gainProb = 0
        let lossProb = 0
        //End Delete

        const SLICE_COUNT = 10;
        [shortLeg.strike, longLeg.strike].forEach(strike => {

            for (let i = 0; i < SLICE_COUNT; i++) {
                const strikeWidth = (strike - breakEven) / SLICE_COUNT // indicates direction, when strike is to right of breakeven then width indicates positive movement, and vice verssa

                const currentStrikePosition = breakEven + strikeWidth * i
                const nextStrikePosition = currentStrikePosition + strikeWidth
                const midpointStrikePosition = (currentStrikePosition + nextStrikePosition) / 2

                const midpointPLValue = (Math.abs(shortLeg.strike - midpointStrikePosition) * -1) * 100 + maxGain // multiply by -1 to signifity that the difference in short leg and whichever in-between price is how much the short leg is down.

                const probWidth = this.stockPriceCDF(volatility, currentStrikePosition, nextStrikePosition)

                if (shortLeg.strike == strike) { // This is the short leg
                    expectedGain += midpointPLValue * probWidth
                    gainProb+=probWidth
                } else {
                    expectedLoss += midpointPLValue * probWidth
                    lossProb+=probWidth
                }
            }
        })

        const gainTotalProb = this.stockPriceCDF(volatility, breakEven, shortLeg.strike)
        const lossTotalProb = this.stockPriceCDF(volatility, longLeg.strike, breakEven)
        
        if (Math.abs(gainTotalProb - gainProb) > 0.000001 || Math.abs(lossTotalProb - lossProb) > 0.000001) {
            console.log(gainTotalProb - gainProb, lossTotalProb - lossProb)
        }

        return {expectedGain, expectedLoss, breakEven, gainProb: gainTotalProb, lossProb: lossTotalProb}

    }

    getVolatilityExpectedValue(strategy: IronCondor | CreditSpread): EvalResult {
        
        this.strategiesEvaluatedVol++

        const factor = 20
        const width = this.stdDevLogVol / factor
        const steps = factor * 8 // 8 stdDev in either direction

        let finalEvalResult: EvalResult = strategy.strategyType == "credit spread" ?  this.evaluateCreditSpread(strategy as CreditSpread, 0) : this.evaluateIronCondor(strategy as IronCondor, 0)
        
        const defaultComponent: ExpectedValueComponent = {expectedPLValue: 0, prob: 0}
        
        finalEvalResult.mark.expectedGainComponent = {...defaultComponent}
        finalEvalResult.mark.expectedLossComponent = {...defaultComponent}
        finalEvalResult.natural.expectedGainComponent = {...defaultComponent}
        finalEvalResult.natural.expectedLossComponent = {...defaultComponent}

        ;[-1, 1].forEach(direction => {

            for (let i = 0; i < steps; i++) {
                const newLogVol = this.meanLogVol + (width * direction) * i

                const nextLogVol = newLogVol + (width * direction) 
                
                const z_1 = (this.meanLogVol - newLogVol) / this.stdDevLogVol
                const z_2 = (this.meanLogVol - nextLogVol) / this.stdDevLogVol

                let volatilityProbWidth = Math.abs(this.normCDF(z_1) - this.normCDF(z_2))

                // Find the midpoint, and use that as the estimation. Note: Midpoint Riemann sum is best for approximating here, as trapezoidal would take much more computation
                const newVol = Math.exp((newLogVol + nextLogVol) / 2)

                
                let evalResult: EvalResult | undefined = undefined

                if (strategy.strategyType == "credit spread") {

                    const creditSpread = strategy as CreditSpread
                    evalResult = this.evaluateCreditSpread(creditSpread, newVol)
                    
                } else {

                    const ironCondor = strategy as IronCondor
                    evalResult = this.evaluateIronCondor(ironCondor, newVol)
                }

                function addExpectedValueComponent(addTo: ExpectedValueComponent, addFrom: ExpectedValueComponent) {
                    // Convert to average PL Value by dividing the expected value by its probability, then weight it by the volatility probability
                    if (addFrom.prob <= 0) return
                    addTo.expectedPLValue += (addFrom.expectedPLValue / addFrom.prob) * volatilityProbWidth
                    addTo.prob += addFrom.prob * volatilityProbWidth
                }

                addExpectedValueComponent(finalEvalResult.mark.expectedGainComponent, evalResult.mark.expectedGainComponent)
                addExpectedValueComponent(finalEvalResult.mark.expectedLossComponent, evalResult.mark.expectedLossComponent)
                addExpectedValueComponent(finalEvalResult.natural.expectedGainComponent, evalResult.natural.expectedGainComponent)
                addExpectedValueComponent(finalEvalResult.natural.expectedLossComponent, evalResult.natural.expectedLossComponent)
            }
        })
        
        return finalEvalResult

    }

    private normCDF(z: number): number {
        return (1.0 + mathjs.erf(z / Math.sqrt(2))) / 2.0;
    }
    
    /**
     * probabiltiy that future stock price will be between two stock price
     * @param {number} r - The risk-free interest rate
     * @returns {number} The cumulative probability between the given prices
     */
    
    private stockPriceCDF(volatility: number, futurePrice1: number, futurePrice2: number, r: number = RISK_FREE_RATE): number {
    
        const S0 = this.currentPrice
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
}





type EvalResult = {
    strategy: CreditSpread | IronCondor
    natural: SubEvalResult
    mark: SubEvalResult
    collateral:number,
}

type SubEvalResult = {
    price: number,
    expectedGainComponent: ExpectedValueComponent,
    expectedLossComponent: ExpectedValueComponent,
    maxLoss: number,
    breakEvens: number[]
    quantity: number
}


type ExpectedValueComponent = {
    expectedPLValue: number, //Should be the average. When multiplied by the probability, should be equivelant to the actual total expected gain or loss
    prob: number
}

// Can be used for price value or probability, for call or put

export { StrategyEvaluator, EvalResult,SubEvalResult }