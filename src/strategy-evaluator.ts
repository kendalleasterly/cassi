import { OptionLeg } from "./html-parser";
import { CreditSpread, IronCondor } from "./strategy-builder";

function evaluateCreditSpread(strategy: CreditSpread, maxCollateral: number): EvalResult {

    const longLeg = strategy.longLeg
    const shortLeg = strategy.shortLeg

    const collateral = Math.abs(shortLeg.strike - longLeg.strike) * 100
    const quantity = Math.floor( maxCollateral  / collateral)

    let markExpectedVal = 0
    let naturalExpectedVal = 0

    let markBreakEvens: number[] = [];
    let naturalBreakEvens: number[] = [];


    ["markExpectedVal", "naturalExpectedVal"].forEach(pricingType => {
        
        let maxGain = 0

        if (pricingType == "naturalExpectedVal") {
            maxGain = (shortLeg.bid - longLeg.ask)  * 100 
        } else {
            const shortLegMark = (shortLeg.bid + shortLeg.ask) / 2
            const longLegMark = (longLeg.bid + longLeg.ask) / 2

            maxGain = (shortLegMark - longLegMark) * 100
        }

        const {expectedReturn, breakEven} = getTriangleExpectedReturns(shortLeg,longLeg,maxGain,strategy.type)
        
        const maxLoss = -(collateral - maxGain)

        const expectedGain = shortLeg.probOTM * maxGain
        const expectedLoss = longLeg.probITM * maxLoss
        

        const expectedValue =  (expectedGain + expectedReturn + expectedLoss ) * quantity

        if (pricingType == "naturalExpectedVal") {
            naturalExpectedVal = expectedValue
            naturalBreakEvens = [breakEven]
        } else {
            markExpectedVal = expectedValue
            markBreakEvens = [breakEven]
        }
    });

    const evalResult: EvalResult = {
        strategy,
        naturalExpectedVal,
        markExpectedVal,
        quantity, 
        collateral,
        naturalBreakEvens,
        markBreakEvens
    }
    
    return evalResult

}

function evaluateIronCondor(strategy: IronCondor, maxCollateral: number): EvalResult {
    const longPut = strategy.longPut
    const shortPut = strategy.shortPut
    const shortCall = strategy.shortCall
    const longCall = strategy.longCall
    
    const collateral = (Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike)) * 100

    const quantity = Math.floor( maxCollateral  / collateral)

    let markExpectedVal = 0
    let naturalExpectedVal = 0

    let markBreakEvens: number[] = []
    let naturalBreakEvens: number[] = []

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

        if (pricingType == "naturalExpectedVal") {
            naturalExpectedVal = expectedReturn
            naturalBreakEvens = [Math.min(putBreakEven, callBreakEven), Math.max(putBreakEven, callBreakEven)]
        } else {
            markExpectedVal = expectedReturn
            markBreakEvens = [Math.min(putBreakEven, callBreakEven), Math.max(putBreakEven, callBreakEven)]
        }
    });

    const evalResult: EvalResult = {
        strategy,
        naturalExpectedVal,
        markExpectedVal,
        quantity,
        collateral,
        markBreakEvens,
        naturalBreakEvens
     }
    
    return evalResult
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
    naturalExpectedVal: number
    markExpectedVal: number
    quantity: number,
    collateral:number,
    markBreakEvens: number[],
    naturalBreakEvens: number[],
}

type SubResult = {
    price: number,
    maxLoss: number,
    breakEvens: number[]
}

const StrategyEvaluator = {evaluateCreditSpread, evaluateIronCondor}

export { StrategyEvaluator, EvalResult }