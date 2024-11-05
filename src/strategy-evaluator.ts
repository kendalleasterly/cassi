import { OptionLeg } from "./html-parser";
import { CreditSpread, IronCondor } from "./strategy-builder";
import * as mathjs from 'mathjs';

const RISK_FREE_RATE = 5.5 / 100
const ACCURACY_FACTOR = 5 * 2 // Should be a multiple of 2

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
        console.log(this.stdDevPrice)
    }

    /***
     * @param {number} volatility
     * 
     */
    evaluateCreditSpread(strategy: CreditSpread, volatility: number): EvalResult {
    
        const shortLeg = strategy.shortLeg
        const longLeg = strategy.longLeg

        const collateral = Math.abs(shortLeg.strike - longLeg.strike) * 100
    
        const defaultSubResult: SubEvalResult = {
            expectedGainComponent: {prob: 0, expectedValue: 0},
            expectedLossComponent: {prob: 0, expectedValue: 0},
            breakEvens: {put: null, call: null},
            price: 0,
            maxLoss: 0,
            quantity: 0,
            expectedValue: 0, // Try not to use that in this context, should really only be used after final volatility expected value has been calculated
        }

        let result: EvalResult = {
            strategy, 
            collateral,
            mark: JSON.parse(JSON.stringify(defaultSubResult)), //Deep copy: prevents referencing the same object in memory
            natural: JSON.parse(JSON.stringify(defaultSubResult))
        };
    
        const pricingTypes: ("natural" | "mark")[] = ["natural", "mark"]
        pricingTypes.forEach(pricingType => {
            
            let maxGain = 0

            if (pricingType == "natural") {
                maxGain = (shortLeg.bid - longLeg.ask) * 100 
            } else {
                const shortLegMark = (shortLeg.bid + shortLeg.ask) / 2
                const longLegMark = (longLeg.bid + longLeg.ask) / 2
    
                maxGain = (shortLegMark - longLegMark) * 100
            }

            if (maxGain < 0) {
                result[pricingType] = defaultSubResult 
                 return // eliminate fully negative positions
            }
    
            const triangles = this.getTriangleExpectedReturns(shortLeg, longLeg , maxGain, volatility)

            const probMaxGain = this.stockPriceCDF(volatility, shortLeg.strike, shortLeg.type == "put" ? 99999999999 : 0)
            const probMaxLoss = this.stockPriceCDF(volatility, longLeg.strike, longLeg.type == "put" ? 0 : 99999999999)

            //Sometimes max loss will be positive
            let maxLoss = maxGain - collateral

            const quantity = Math.min((maxLoss >= 0 ? 99999 : Math.floor( this.maxAcceptableLoss  / maxLoss)), Math.floor(this.maxCollateral / collateral))
            
            const expectedGain = (probMaxGain * maxGain + triangles.expectedGain) * quantity
            const expectedLoss = (probMaxLoss * maxLoss + triangles.expectedLoss) * quantity
    
            if (volatility != 0 && (isNaN(expectedGain) || isNaN(expectedLoss))) {
                console.log("- - - NAN! - - -", {strategy, volatility})
            }
    
            const gainProb = triangles.gainProb + probMaxGain
            const lossProb = triangles.lossProb + probMaxLoss

            if (gainProb + lossProb > 1.00001) {
                console.log(strategy.shortLeg, strategy.longLeg)
            }

            let subEvalResult: SubEvalResult = {
                quantity: quantity,
                expectedGainComponent: {expectedValue: expectedGain, prob: gainProb},
                expectedLossComponent: {expectedValue: expectedLoss, prob: lossProb},
                breakEvens: shortLeg.type == "put" ? {put: triangles.breakEven, call: null} : {put: null, call: triangles.breakEven},
                maxLoss: maxLoss  * quantity,
                price: maxGain / 100,
                expectedValue: expectedGain + expectedLoss
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
     * 
     * @param volatility The regular, annualized volatility to be used for probability calculations. NOT the log volatility
     */
    evaluateIronCondor(strategy: IronCondor, volatility: number): EvalResult {
        const longPut = strategy.longPut
        const shortPut = strategy.shortPut
        const shortCall = strategy.shortCall
        const longCall = strategy.longCall
        
        const collateral = Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike) * 100

        const defaultSubResult: SubEvalResult = {
            expectedGainComponent: {prob: 0, expectedValue: 0},
            expectedLossComponent: {prob: 0, expectedValue: 0},
            breakEvens: {put: null, call: null},
            price: 0,
            maxLoss: 0,
            quantity: 0,
            expectedValue: 0, // Try not to use that in this context, should really only be used after final volatility expected value has been calculated
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
    
        const pricingTypes: ("natural" | "mark")[] = ["natural", "mark"]
        pricingTypes.forEach(pricingType => {
    
            if (pricingType == "natural") {

                putMaxGain = (shortPut.bid - longPut.ask) * 100
                callMaxGain = (shortCall.bid - longCall.ask) * 100
    
            } else { // change all the values to mark using the natural ones already set
    
                putMaxGain = ( putMaxGain + (shortPut.ask - longPut.bid) * 100) / 2
                callMaxGain = ( callMaxGain + (shortCall.ask - longCall.bid) * 100) / 2
                
            }
            
            totalMaxGain = putMaxGain + callMaxGain // In P/L Dollars, already multiplied by 100

            if (totalMaxGain < 0) {
                result[pricingType] = defaultSubResult 
                return // eliminate fully negative positions
            }
    
            const putTriangle = this.getTriangleExpectedReturns(shortPut, longPut, totalMaxGain, volatility)
            const callTriangle = this.getTriangleExpectedReturns(shortCall, longCall, totalMaxGain, volatility)
    
            const probMaxGain = this.stockPriceCDF(volatility, shortPut.strike, shortCall.strike)
            const expectedMaxGain = totalMaxGain * probMaxGain
            
            //find expected loss for call & put side
            //could be different for both sides. just find the expected loss for both sides
            const probPutMaxLoss = this.stockPriceCDF(volatility, 0, longPut.strike)
            const probCallMaxLoss = this.stockPriceCDF(volatility, longCall.strike, 999999999)
    
            const expectedPutMaxLoss = (totalMaxGain - (shortPut.strike - longPut.strike) * 100) * probPutMaxLoss
            const expectedCallMaxLoss = (totalMaxGain - (longCall.strike - shortCall.strike) * 100) * probCallMaxLoss
    
            let maxLoss = Math.min(totalMaxGain - (shortPut.strike - longPut.strike) * 100, totalMaxGain - (longCall.strike - shortCall.strike) * 100 )

            //TODO: Not always negative, not always 
            
            const quantity = Math.min(maxLoss >= 0 ? 9999 : Math.floor(this.maxAcceptableLoss / maxLoss), Math.floor(this.maxCollateral / collateral))

            const expectedGain = (putTriangle.expectedGain + expectedMaxGain + callTriangle.expectedGain) * quantity
            const expectedLoss = (expectedPutMaxLoss + putTriangle.expectedLoss + callTriangle.expectedLoss + expectedCallMaxLoss) * quantity

            const probGain = putTriangle.gainProb + probMaxGain + callTriangle.gainProb
            const probLoss = probPutMaxLoss + putTriangle.lossProb + callTriangle.lossProb + probCallMaxLoss
    
            if (volatility != 0 && (isNaN(expectedGain) || isNaN(expectedLoss) || isNaN(quantity))) {
                console.error("Expected return or quantity was NAN", {strategy})
            }
    
            let subEvalResult: SubEvalResult = { // All use quantity in calculation
                quantity: quantity,
                expectedGainComponent: {expectedValue: expectedGain, prob: probGain},
                expectedLossComponent: {expectedValue: expectedLoss, prob: probLoss},
                expectedValue: expectedGain + expectedLoss,
                breakEvens: {put: putTriangle.breakEven, call: callTriangle.breakEven},
                price: totalMaxGain / 100, // Per contract, doesn't need quantity
                maxLoss: maxLoss * quantity
            }

    
            result[pricingType] = subEvalResult

        });
        
        return result
    }

    /** 
    * Uses a Reimann sum to calculate an expected value of the triangles in between strikes
    * 
    * @param {number} maxGain In P/L Dollars, Already multiplied by 100 (Per 100 Shares, or 1 contract).
    **/
    private getTriangleExpectedReturns(shortLeg: OptionLeg, longLeg: OptionLeg, maxGain: number, volatility: number ): {expectedGain: number, gainProb: number, expectedLoss: number, lossProb: number, breakEven: number | null}  {
        const type = shortLeg.type

        // Breakeven signifies when the position should be worth 0, since someone could execute our short for the same amount as our net credit recieved
        let breakEven: null | number = null

        //Check if breakeven exists: If max loss is positive, then there isn't a breakeven

        const maxLoss = maxGain - Math.abs(shortLeg.strike - longLeg.strike)*100
        if (maxLoss < 0) {
            breakEven = shortLeg.strike + (maxGain * (type == "put" ? -1 : 1) / 100) // division by 100 to caclulate the max gain per share
        }

        // 10 slices per triagngle, two triangles: one on either side of the breakeven
        let expectedGain = 0
        let expectedLoss = 0

        let gainProb = 0
        let lossProb = 0

        const SLICE_COUNT = ACCURACY_FACTOR / 2

        const strikeArray = [shortLeg.strike]
        if (breakEven) strikeArray.push(longLeg.strike)

        strikeArray.forEach(strike => {

            for (let i = 0; i < SLICE_COUNT; i++) {
                const distance = (breakEven ? strike - breakEven : longLeg.strike - shortLeg.strike) // Also indicates direction: Move FROM the breakeven TO the strike (if no breakeven, FROM short TO long). When start location is to right of end location then width indicates positive movement, and vice verssa. 
                const strikeWidth = distance / SLICE_COUNT 

                const currentStrikePosition = (breakEven ? breakEven : shortLeg.strike) + strikeWidth * i
                const nextStrikePosition = currentStrikePosition + strikeWidth

                const midpointStrikePosition = (currentStrikePosition + nextStrikePosition) / 2
                
                const shortCallLoss = Math.abs(shortLeg.strike - midpointStrikePosition) // (could be pos or neg depending on call or put)
                const midpointPLValue = maxGain - shortCallLoss * 100 

                const probArea = this.stockPriceCDF(volatility, currentStrikePosition, nextStrikePosition)

                if (shortLeg.strike == strike) { // This is the short leg
                    expectedGain += midpointPLValue * probArea
                    gainProb+=probArea
                } else {
                    expectedLoss += midpointPLValue * probArea
                    lossProb+=probArea
                }
            }

        })

        return {expectedGain, expectedLoss, breakEven, gainProb, lossProb}

    }

    getVolatilityExpectedValue(strategy: IronCondor | CreditSpread): EvalResult {
        
        this.strategiesEvaluatedVol++

        const width = this.stdDevLogVol / ACCURACY_FACTOR
        const steps = ACCURACY_FACTOR * 2 // 8 stdDev in either direction

        let finalResult: EvalResult = strategy.strategyType == "credit spread" ?  this.evaluateCreditSpread(strategy as CreditSpread, 0) : this.evaluateIronCondor(strategy as IronCondor, 0)
        
        const defaultComponent: ExpectedValueComponent = {expectedValue: 0, prob: 0}
        
        finalResult.mark.expectedGainComponent = {...defaultComponent}
        finalResult.mark.expectedLossComponent = {...defaultComponent}
        finalResult.natural.expectedGainComponent = {...defaultComponent}
        finalResult.natural.expectedLossComponent = {...defaultComponent}

        ;[-1, 1].forEach(direction => {

            for (let i = 0; i < steps; i++) {
                const newLogVol = this.meanLogVol + (width * direction) * i

                const nextLogVol = newLogVol + (width * direction) 
                
                const z_1 = (this.meanLogVol - newLogVol) / this.stdDevLogVol
                const z_2 = (this.meanLogVol - nextLogVol) / this.stdDevLogVol

                let volatilityProbWidth = Math.abs(this.normCDF(z_1) - this.normCDF(z_2))

                // Find the midpoint, and use that as the estimation. Note: Midpoint Riemann sum is best for approximating here, as trapezoidal would take much more computation
                const regularMidpointVol = Math.exp((newLogVol + nextLogVol) / 2)

                
                let evalResult: EvalResult | undefined = undefined

                if (strategy.strategyType == "credit spread") {

                    const creditSpread = strategy as CreditSpread
                    evalResult = this.evaluateCreditSpread(creditSpread, regularMidpointVol)
                    
                } else {

                    const ironCondor = strategy as IronCondor
                    evalResult = this.evaluateIronCondor(ironCondor, regularMidpointVol)

                }

                function addExpectedValueComponent(addTo: ExpectedValueComponent, addFrom: ExpectedValueComponent) {
                    // Has been converted to average PL Value by dividing the expected value by its probability.
                    // Weight those results by the volatility probability
                    if (addFrom.prob == 0) return
                    if (addFrom.prob < 0) console.error("Sub-Zero probability")
                    addTo.expectedValue += addFrom.expectedValue * volatilityProbWidth
                    addTo.prob += addFrom.prob * volatilityProbWidth
                }

                addExpectedValueComponent(finalResult.mark.expectedGainComponent, evalResult.mark.expectedGainComponent)
                addExpectedValueComponent(finalResult.mark.expectedLossComponent, evalResult.mark.expectedLossComponent)
                addExpectedValueComponent(finalResult.natural.expectedGainComponent, evalResult.natural.expectedGainComponent)
                addExpectedValueComponent(finalResult.natural.expectedLossComponent, evalResult.natural.expectedLossComponent)

                
                const markSum = evalResult.mark.expectedGainComponent.prob + evalResult.mark.expectedLossComponent.prob
                if (( markSum >= 1.001 || markSum <= 0.999) && markSum != 0) {
                    console.log(evalResult)
                }

                const naturalSum = evalResult.natural.expectedGainComponent.prob + evalResult.natural.expectedLossComponent.prob
                if ( (naturalSum >= 1.001 || naturalSum <= 0.999) && naturalSum != 0 ) {
                    console.log(evalResult)
                }
            }
        })

        // calculate the final expected value for mark and natural

        finalResult.mark.expectedValue = finalResult.mark.expectedGainComponent.expectedValue + finalResult.mark.expectedLossComponent.expectedValue 
        finalResult.natural.expectedValue = finalResult.natural.expectedGainComponent.expectedValue + finalResult.natural.expectedLossComponent.expectedValue 
        
        return finalResult

    }

    private normCDF(z: number): number {
        return (1.0 + mathjs.erf(z / Math.sqrt(2))) / 2.0;
    }
    
    /**
     * probabiltiy that future stock price will be between two stock price
     * @param {number} r - The risk-free interest rate
     * @param {number} volatility The volatility in regular, annualized format (Do NOT pass in the log volatility version.)
     * @returns {number} The cumulative probability between the given prices
     */
    
    stockPriceCDF(volatility: number, futurePrice1: number, futurePrice2: number, r: number = RISK_FREE_RATE): number {
    
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
    expectedValue: number,
    expectedGainComponent: ExpectedValueComponent,
    expectedLossComponent: ExpectedValueComponent,
    maxLoss: number,
    breakEvens: {put: number | null, call: number | null}
    quantity: number
}


type ExpectedValueComponent = {
    expectedValue: number, //Should be the expected value.
    prob: number
}

// Can be used for price value or probability, for call or put

export { StrategyEvaluator, EvalResult,SubEvalResult }