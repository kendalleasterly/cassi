import { OptionLeg } from "./html-parser";
import { CreditSpread, IronCondor } from "./strategy-builder";
import * as mathjs from 'mathjs';

const RISK_FREE_RATE = 5.5 / 100

class StrategyEvaluator {

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
        console.log({stdDevPrice: this.stdDevPrice, timeToExp, meanVolatility, currentPrice})
    }

    evaluateCreditSpread(strategy: CreditSpread, maxCollateral: number, maxAcceptableLoss: number, volatility: number): EvalResult {
    
        
        const collateral = Math.abs(shortLeg.strike - longLeg.strike) * 100
    
        let result: EvalResult = {
            strategy, 
            collateral,
            mark: {
                expectedValue: 0,
                breakEvens: [],
                price: 0,
                maxLoss: 0,
                quantity: 0
            },
            natural: {
                expectedValue: 0,
                breakEvens: [],
                price: 0,
                maxLoss: 0,
                quantity: 0
            }
        };
    
    
        ["naturalExpectedVal", "markExpectedVal"].forEach(pricingType => {
            
            //eval result
            const quantity = Math.min(Math.floor( maxAcceptableLoss / maxLoss * -1), Math.floor(maxCollateral / collateral))
            
            result.collateral = collateral
    
            // const expectedGain = shortLeg.probOTM * maxGain
            // const expectedLoss = longLeg.probITM * maxLoss
    
           

            let subEvalResult = {
                quantity: quantity,
                expectedValue: expectedValue * quantity,
                breakEvens: [triangles.breakEven],
                maxLoss: maxLoss  * quantity,
                price: maxGain / 100
            }
    
            if (pricingType == "naturalExpectedVal") {
                result.natural = subEvalResult
    
            } else {
                result.mark = subEvalResult
            }
        });
        
        return result
    
    }

    evaluateIronCondor(strategy: IronCondor, maxCollateral: number, maxAcceptableLoss: number, volatility: number): EvalResult {
        const longPut = strategy.longPut
        const shortPut = strategy.shortPut
        const shortCall = strategy.shortCall
        const longCall = strategy.longCall
        
        const collateral = Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike) * 100
    
        let result: EvalResult = {
            strategy, 
            collateral,
            mark: {
                expectedValue: 0,
                breakEvens: [],
                price: 0,
                maxLoss: 0,
                quantity: 0
            },
            natural: {
                expectedValue: 0,
                breakEvens: [],
                price: 0,
                maxLoss: 0,
                quantity: 0
            }
        };
    
        ["naturalExpectedVal", "markExpectedVal"].forEach(pricingType => {
            
    
            const probMaxTotalGain = shortPut.probOTM - shortCall.probITM // same as (short call prob otm) - (short put prob itm)
    
            const expectedMaxGain = maxTotalGain * probMaxTotalGain
            
    
            //find expected loss for call & put side
            //could be different for both sides. just find the expected loss for both sides
    
            const expectedCallLoss = -((longCall.strike - shortCall.strike) * 100 - maxTotalGain) * longCall.probITM
            const expectedPutLoss = -((shortPut.strike - longPut.strike) * 100 - maxTotalGain) * longPut.probITM
    
    
            const maxLoss = -Math.max((longCall.strike - shortCall.strike) * 100 - maxTotalGain, (shortPut.strike - longPut.strike) * 100 - maxTotalGain)
            const quantity = Math.min(Math.floor( maxAcceptableLoss  / maxLoss * -1), Math.floor(maxCollateral / collateral))
            
            result.collateral = collateral
            
            let breakEvens = [putTriangles.breakEven, callTriangles.breakEven]
            breakEvens = [Math.min(...breakEvens), Math.max(...breakEvens)]
    
            let subEvalResult = {
                quantity: quantity,
                expectedValue: expectedReturn  * quantity,
                breakEvens: breakEvens,
                price: maxTotalGain / 100,
                maxLoss: maxLoss * quantity
            }
    
            if (pricingType == "naturalExpectedVal") {
                result.natural = subEvalResult
            } else {
                result.mark = subEvalResult
            }
        });
        
        return result
    }

    getTriangleValues(shortLeg: OptionLeg, longLeg: OptionLeg, maxGain: number, type: "call" | "put"): {maxLoss: number, gain: number, loss: number, breakevenPrice: number} {
        //find the breakeven

        // Can be different between sides of an iron condor, so that's why it gets calculated in here. For credit spreads, its redundant but for iron condors it takes care of an edge case
        const sideMaxLoss = -Math.abs(shortLeg.strike - longLeg.strike) * 100 + maxGain
        const breakevenPrice = shortLeg.strike + maxGain / 100 * (type == "put" ? -1 : 1) 
        
        // Short to breakeven Gain
        const gain = maxGain / 2 // (base (width between strike & breakeven) * height (gain) / 2) / base width; The result is only partially calculated, as we multiply the base back in the probability dimension
        // Long to breakeven Loss
        const loss = sideMaxLoss / 2

        console.log({gain, loss, breakevenPrice})
       
        return {maxLoss: sideMaxLoss, gain, loss, breakevenPrice}

    }


    getCreditSpreadComponentValues(strategy: CreditSpread, pricingType: "natural" | "mark"): {sideValues: SideValues, maxGain: number, breakevenPrice: number} {
        const shortLeg = strategy.shortLeg
        const longLeg = strategy.longLeg

        // Calculate max gain
        let maxGain = 0

        if (pricingType == "natural") {
            maxGain = (shortLeg.bid - longLeg.ask) * 100 
        } else {
            const shortLegMark = (shortLeg.bid + shortLeg.ask) / 2
            const longLegMark = (longLeg.bid + longLeg.ask) / 2

            maxGain = (shortLegMark - longLegMark) * 100
        }

        // Get the Breakeven
        const {maxLoss, loss: longToBreakeven, gain: shortToBreakeven, breakevenPrice} = this.getTriangleValues(shortLeg, longLeg, maxGain, strategy.type)
            

        return {sideValues: {maxLoss, longToBreakeven, shortToBreakeven}, maxGain, breakevenPrice}
    }

    /**
     * Gets an Iron Condor, and how it should be priced (natural or mark). Outputs all of the price values for each component on the Iron Condor's P/L Chart
     */
    getIronCondorComponentValues(strategy: IronCondor, pricingType: "natural" | "mark"): {putValues: SideValues, maxGain: number, callValues: SideValues, breakevenPrices: number[]} {
        const longPut = strategy.longPut
        const shortPut = strategy.shortPut
        const shortCall = strategy.shortCall
        const longCall = strategy.longCall

        // Calculate max gain
        let putMaxGain = 0
        let callMaxGain = 0
        let totalMaxGain = 0;

        putMaxGain = (shortPut.bid - longPut.ask) * 100
        callMaxGain = (shortCall.bid - longCall.ask) * 100

        if (pricingType == "mark") { // change all the values to mark using the natural ones already set

            putMaxGain = ( putMaxGain + (shortPut.ask - longPut.bid) * 100) / 2
            callMaxGain = ( callMaxGain + (shortCall.ask - longCall.bid) * 100) / 2
            
        }

        totalMaxGain = putMaxGain + callMaxGain

        // Get the Breakeven
        const putTriangles = this.getTriangleValues(shortPut, longPut, totalMaxGain, "put")
        const callTriangles = this.getTriangleValues(shortCall, longCall, totalMaxGain, "call")

        const breakevens = [putTriangles.breakevenPrice, callTriangles.breakevenPrice]

        return {
            putValues: {maxLoss: putTriangles.maxLoss, longToBreakeven: putTriangles.loss, shortToBreakeven: putTriangles.gain},
            callValues: {maxLoss: callTriangles.maxLoss, longToBreakeven: callTriangles.loss, shortToBreakeven: callTriangles.gain},
            maxGain: totalMaxGain,
            breakevenPrices: [Math.min(...breakevens), Math.max(...breakevens)]
        }
    }

    getTriangleProbabilities(shortLeg: OptionLeg, longLeg: OptionLeg, breakevenPrice: number, volatility: number): SideValues {

        const probMaxloss = this.stockPriceCDF(volatility, longLeg.strike, longLeg.type == "put" ? 0 : 999999999999)
        const probLongToBreakeven = this.stockPriceCDF(volatility, longLeg.strike, breakevenPrice)
        const probShortToBreakeven = this.stockPriceCDF(volatility, breakevenPrice, shortLeg.strike)

        return {shortToBreakeven: probShortToBreakeven, longToBreakeven: probLongToBreakeven, maxLoss: probMaxloss}
    }
    



    /*** 
    @returns Total P(win), Total win value, Total P(loss), Total loss value
    ***/
    getVolatilityExpectedValue(strategy: IronCondor | CreditSpread): {markExpandedExpectedVal: ExpandedExpectedVal, naturalExpandedExpectedVal: ExpandedExpectedVal} {
        
        this.strategiesEvaluatedVol++

        // We must separate mark and natural at the very start because the probabilities are DEPENDENT on the pricing type; as the breakeven price changes, the probabilities also change. The only values that aren't dependent on the pricing type are Probability of max loss and Probability of max gain

        // Necessary to be specific to pass type checks
        const pricingTypes: ("natural" | "mark")[] = ["natural", "mark"]
        pricingTypes.forEach(pricingType => {

            // At least one set of side values will get used. if it is iron condor, both will
            let putPriceValues: SideValues = {shortToBreakeven: 0, longToBreakeven: 0, maxLoss: 0}
            let callPriceValues: SideValues = {shortToBreakeven: 0, longToBreakeven: 0, maxLoss: 0}
            let maxGain = 0
            let breakevenPrices: number[] = []

            //Get the values for each component of P/L Chart (4-7 of them) and the breakeven(s)
            if (strategy.strategyType == "credit spread") {
                const creditSpread = strategy as CreditSpread
                const componentsValues = this.getCreditSpreadComponentValues(creditSpread, pricingType)
                
                if (creditSpread.type == "put") { putPriceValues = componentsValues.sideValues }
                else { callPriceValues = componentsValues.sideValues }
                
                maxGain = componentsValues.maxGain
                breakevenPrices = [componentsValues.breakevenPrice]

            } else {
                const componentsValues = this.getIronCondorComponentValues(strategy as IronCondor, pricingType)

                putPriceValues = componentsValues.putValues
                callPriceValues = componentsValues.callValues

                maxGain = componentsValues.maxGain
                breakevenPrices = componentsValues.breakevenPrices
            }

            const factor = 20
            const width = this.stdDevLogVol / factor
            const steps = factor * 8 // 8 stdDev in either direction

            let putProbabilities:SideValues = {maxLoss: 0, longToBreakeven: 0, shortToBreakeven:0};
            let probMaxGain = 0
            let callProbabilities: SideValues = {maxLoss: 0, longToBreakeven: 0, shortToBreakeven:0};
            
            [-1, 1].forEach(direction => {

                for (let i = 0; i < steps; i++) {
                    const newLogVol = this.meanLogVol + (width * direction) * i

                    const nextLogVol = newLogVol + (width * direction) 
                    
                    const z_1 = (this.meanLogVol - newLogVol) / this.stdDevLogVol
                    const z_2 = (this.meanLogVol - nextLogVol) / this.stdDevLogVol

                    let probWidth = Math.abs(this.normCDF(z_1) - this.normCDF(z_2))

                    // Find the midpoint, and use that as the estimation. Note: Midpoint Riemann sum is best for approximating here, as trapezoidal would take much more effort
                    const newVol = Math.exp((newLogVol + nextLogVol) / 2)

                    // Must use an index instead of using the actual value. the computer is saying -2.4083189802728207 ≠ -2.408318980272821

                    
                    function addWeightedProbabilities(addTo: SideValues, addFrom: SideValues) {
                        // Weight is the width

                        addTo.longToBreakeven += addFrom.longToBreakeven * probWidth
                        addTo.shortToBreakeven += addFrom.shortToBreakeven * probWidth
                        addTo.maxLoss += addFrom.maxLoss * probWidth
                    }

                    if (strategy.strategyType == "credit spread") {

                        const creditSpread = strategy as CreditSpread

                        const triangleProbabilities = this.getTriangleProbabilities(creditSpread.shortLeg, creditSpread.longLeg, breakevenPrices[0], newVol)

                        if (creditSpread.type == "put") {
                            addWeightedProbabilities(putProbabilities, triangleProbabilities)
                        } else {
                            addWeightedProbabilities(callProbabilities, triangleProbabilities)
                        }

                        probMaxGain += this.stockPriceCDF(newVol, creditSpread.shortLeg.strike, creditSpread.shortLeg.type == "put" ? 999999999999 : 0)

                    } else {

                        const ironCondor = strategy as IronCondor

                        const putTriangleProbs = this.getTriangleProbabilities(ironCondor.shortPut, ironCondor.longPut, breakevenPrices[0], newVol)
                        const callTriangleProbs = this.getTriangleProbabilities(ironCondor.shortCall, ironCondor.longCall, breakevenPrices[0], newVol)

                        addWeightedProbabilities(putProbabilities, putTriangleProbs)
                        addWeightedProbabilities(callProbabilities, callTriangleProbs)

                        probMaxGain += this.stockPriceCDF(newVol, ironCondor.shortCall.strike, ironCondor.shortPut.strike)
                    }
                }
            })

            console.log({putProbabilities, probMaxGain, callProbabilities})

            // weight each component, 

        })

        

        //Construct the smaller components

        
        return {expectedMarkValue: expectedMarkVal, expectedNaturalValue: expectedNaturalVal}

    }

    

    /**
     * 
     * @param {OptionLeg} option - The option to have its probabilties simulated when at the target price
     * @param {number} newPrice - The simulated price of the stock (provides context to know how far we need to go to target price)
     * @returns {OptionLeg} The new option leg profile with the simulated probabilities
     */
    simulateProfile(option: OptionLeg, newPrice: number, volatility: number): OptionLeg {

        let newProfile = option
        
        newProfile.probITM = this.stockPriceCDF(newPrice, volatility, option.type == "put" ? 0 : 9999999999, newProfile.strike)
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
    expectedValue: number
    maxLoss: number,
    breakEvens: number[]
    quantity: number
}

type ExpandedExpectedVal = {
    probGain: number,
    gain: number,
    probLoss: number,
    loss: number
}

// Can be used for price value or probability, for call or put
type SideValues = {
    maxLoss: number,
    longToBreakeven: number,
    shortToBreakeven: number
}

export { StrategyEvaluator, EvalResult }