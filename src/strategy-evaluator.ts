import { OptionLeg } from "./html-parser";
import { CreditSpread, IronCondor } from "./strategy-builder";

function evaluateCreditSpread(strategy: CreditSpread, maxCollateral: number): EvalResult {

    const longLeg = strategy.longLeg
    const shortLeg = strategy.shortLeg

    const collateral = Math.abs(shortLeg.strike - longLeg.strike) * 100
    const quantity = Math.floor( maxCollateral  / collateral)

    let result: EvalResult = {
        strategy, 
        quantity,
        collateral,
        mark: {
            expectedValue: 0,
            breakEvens: [],
            maxGain: 0,
            maxLoss: 0
        },
        natural: {
            expectedValue: 0,
            breakEvens: [],
            maxGain: 0,
            maxLoss: 0
        }
    };


    ["markExpectedVal", "naturalExpectedVal"].forEach(pricingType => {
        
        let maxGain = 0

        if (pricingType == "naturalExpectedVal") {
            maxGain = (shortLeg.bid - longLeg.ask)  * 100 
        } else {
            const shortLegMark = (shortLeg.bid + shortLeg.ask) / 2
            const longLegMark = (longLeg.bid + longLeg.ask) / 2

            maxGain = (shortLegMark - longLegMark) * 100
        }

        const {expectedReturn: triangleExpectedReturn, breakEven} = getTriangleExpectedReturns(shortLeg,longLeg,maxGain,strategy.type)
        
        const maxLoss = -(collateral - maxGain)

        const expectedGain = shortLeg.probOTM * maxGain
        const expectedLoss = longLeg.probITM * maxLoss
        
        const expectedValue =  (expectedGain + triangleExpectedReturn + expectedLoss ) * quantity

        if (pricingType == "naturalExpectedVal") {
            result.natural.expectedValue = expectedValue
            result.natural.breakEvens = [breakEven]
            result.natural.maxLoss = maxLoss
            result.natural.maxGain = maxGain

        } else {
            result.mark.expectedValue = expectedValue
            result.mark.breakEvens = [breakEven]
            result.mark.maxLoss = maxLoss
            result.mark.maxGain = maxGain
        }
    });
    
    return result

}

function evaluateIronCondor(strategy: IronCondor, maxCollateral: number): EvalResult {
    const longPut = strategy.longPut
    const shortPut = strategy.shortPut
    const shortCall = strategy.shortCall
    const longCall = strategy.longCall
    
    const collateral = Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike) * 100
    const quantity = Math.floor( maxCollateral  / collateral)

    let result: EvalResult = {
        strategy, 
        quantity,
        collateral,
        mark: {
            expectedValue: 0,
            breakEvens: [],
            maxGain: 0,
            maxLoss: 0
        },
        natural: {
            expectedValue: 0,
            breakEvens: [],
            maxGain: 0,
            maxLoss: 0
        }
    }

    let maxShortPutGain = 0
    let maxShortCallGain = 0
    let maxTotalGain = 0;

    ["naturalExpectedVal", "markExpectedVal"].forEach(pricingType => {


        if (pricingType == "naturalExpectedVal") {

            maxShortPutGain = (shortPut.bid - longPut.ask) * 100
            maxShortCallGain = (shortCall.bid - longCall.ask) * 100
            

        } else { // change all the values to mark using the natural ones already set

            maxShortPutGain = ( maxShortPutGain + (shortPut.ask - longPut.bid) * 100) / 2
            maxShortCallGain = ( maxShortCallGain + (shortCall.ask - longCall.bid) * 100) / 2
            
        }

        maxTotalGain = maxShortPutGain + maxShortCallGain

        const {expectedReturn: putTriangleExpectedReturn, breakEven: putBreakEven} = getTriangleExpectedReturns(shortPut, longPut, maxTotalGain, "put")
        const {expectedReturn: callTriangleExpectedReturn, breakEven: callBreakEven} = getTriangleExpectedReturns(shortCall, longCall, maxTotalGain, "call")

        const probMaxTotalGain = shortPut.probOTM - shortCall.probITM // same as (short call prob otm) - (short put prob itm)

        const expectedMaxGain = maxTotalGain * probMaxTotalGain
        

        //find expected loss for call & put side
        //could be different for both sides. just find the expected loss for both sides

        const expectedCallLoss = -((longCall.strike - shortCall.strike) * 100 - maxTotalGain) * longCall.probITM
        const expectedPutLoss = -((shortPut.strike - longPut.strike) * 100 - maxTotalGain) * longPut.probITM

        const expectedReturn = (expectedPutLoss + putTriangleExpectedReturn + expectedMaxGain + callTriangleExpectedReturn + expectedCallLoss)  * quantity

        const maxLoss = -Math.max((longCall.strike - shortCall.strike) * 100 - maxTotalGain, (shortPut.strike - longPut.strike) * 100 - maxTotalGain)
        const breakEvens = [Math.min(putBreakEven, callBreakEven), Math.max(putBreakEven, callBreakEven)]

        if (pricingType == "naturalExpectedVal") {
            result.natural.expectedValue = expectedReturn
            result.natural.breakEvens = breakEvens
            result.natural.maxGain = maxTotalGain
            result.natural.maxLoss = maxLoss
            // #todo add in the max value here
        } else {
            result.mark.expectedValue = expectedReturn
            result.mark.breakEvens = breakEvens
            result.mark.maxGain = maxTotalGain
            result.mark.maxLoss = maxLoss
        }
    });
    
    return result
}


function getTriangleExpectedReturns(shortLeg: OptionLeg, longLeg: OptionLeg, maxGain: number, type: "call" | "put" ): {expectedReturn: number, breakEven: number} {
        //find the breakeven

        const maxLoss = -Math.abs(shortLeg.strike - longLeg.strike) * 100 + maxGain
        const breakEven = shortLeg.strike + maxGain * (type == "put" ? -1 : 1) / 100
        
       
        const totalDistance = Math.abs(shortLeg.strike - longLeg.strike)
        const longToBreakevenRatio = Math.abs(breakEven - longLeg.strike) / totalDistance
        const shortToBreakevenRatio = 1 - longToBreakevenRatio

        // console.log({maxLoss, breakevenPrice, totalDistance, longToBreakevenRatio, shortToBreakevenRatio, maxGain})

        //all ratios are set, now get the loss and gain probabilities from the total (small) probability
        const totalProbability = shortLeg.probITM - longLeg.probITM

        const shortToBreakevenGain = maxGain / 2 // (base (width between strike & breakeven) * height (gain) / 2) / base to get it in P/L
        const longToBreakevenLoss = maxLoss / 2


        const expectedGain = shortToBreakevenGain * (totalProbability * shortToBreakevenRatio)
        const expectedLoss = longToBreakevenLoss * (totalProbability * shortToBreakevenRatio)

        return {expectedReturn: expectedGain + expectedLoss, breakEven}

}



type EvalResult = {
    strategy: CreditSpread | IronCondor
    natural: SubEvalResult
    mark: SubEvalResult
    quantity: number,
    collateral:number,
}

type SubEvalResult = {
    maxGain: number,
    expectedValue: number
    maxLoss: number,
    breakEvens: number[]
}

const StrategyEvaluator = {evaluateCreditSpread, evaluateIronCondor}

export { StrategyEvaluator, EvalResult }