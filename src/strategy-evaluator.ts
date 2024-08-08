import { OptionLeg } from "./html-parser";
import { CreditSpread, IronCondor } from "./strategy-builder";

function evaluateCreditSpread(strategy: CreditSpread, maxCollateral: number): EvalResult {

    const longLeg = strategy.longLeg
    const shortLeg = strategy.shortLeg

    //put credit spread first

    //I wanna do mark and natural price

    const collateral = Math.abs(shortLeg.strike - longLeg.strike) * 100
    const quantity = Math.floor( maxCollateral  / collateral)

    // console.log({collateral, quantity})

    let markExpectedVal = 0
    let naturalExpectedVal = 0;

    ["markExpectedVal", "naturalExpectedVal"].forEach(pricingType => {
        
        let maxGain = 0

        if (pricingType == "naturalExpectedVal") {
            maxGain = (shortLeg.bid - longLeg.ask)  * 100 
        } else {
            const shortLegMark = (shortLeg.bid + shortLeg.ask) / 2
            const longLegMark = (longLeg.bid + longLeg.ask) / 2

            maxGain = (shortLegMark - longLegMark) * 100
        }

        const triangleExpectedReturn = getTriangleExpectedReturns(shortLeg,longLeg,maxGain,strategy.type)
        
        const maxLoss = -(collateral - maxGain)

        const expectedGain = shortLeg.probOTM * maxGain
        const expectedLoss = longLeg.probITM * maxLoss
        

        const expectedValue =  (expectedGain + triangleExpectedReturn + expectedLoss ) * quantity

        // console.log({maxGain, maxLoss, expectedGain, expectedLoss, triangleExpectedReturn, expectedValue})

        if (pricingType == "naturalExpectedVal") {
            naturalExpectedVal = expectedValue
        } else {
            markExpectedVal = expectedValue
        }
    });

    const evalResult = {
        strategy,
        naturalExpectedVal,
        markExpectedVal,
        quantity, 
        collateral
    }
    
    return evalResult

}

function evaluateIronCondor(strategy: IronCondor, maxCollateral: number): EvalResult {
    const longPut = strategy.longPut
    const shortPut = strategy.shortPut
    const shortCall = strategy.shortCall
    const longCall = strategy.longCall
    

    //put credit spread first

    //I wanna do mark and natural price

    //what is the greater difference between the strikes?
    const collateral = (Math.max(shortPut.strike - longPut.strike, longCall.strike - shortCall.strike)) * 100
    // console.log({collateral})
    const quantity = Math.floor( maxCollateral  / collateral)

    let markExpectedVal = 10
    let naturalExpectedVal = 10

    let maxShortPutGain = 0
    let maxShortCallGain = 0
    let maxTotalGain = 0;

    ["naturalExpectedVal", "markExpectedVal"].forEach(pricingType => {
        // console.log(shortPut.strike + "- - - ENTER: " + pricingType + " - - -")

        if (pricingType == "naturalExpectedVal") {

            maxShortPutGain = (shortPut.bid - longPut.ask) * 100
            maxShortCallGain = (shortCall.bid - longCall.ask) * 100
            

        } else { // change all the values to mark using the natural ones already set

            maxShortPutGain = ( maxShortPutGain + (shortPut.ask - longPut.bid) * 100) / 2
            maxShortCallGain = ( maxShortCallGain + (shortCall.ask - longCall.bid) * 100) / 2
            
        }

        maxTotalGain = maxShortPutGain + maxShortCallGain

        const putTriangleExpectedReturn = getTriangleExpectedReturns(shortPut, longPut, maxTotalGain, "put")
        const callTriangleExpectedReturn = getTriangleExpectedReturns(shortCall, longCall, maxTotalGain, "call")

        const probMaxTotalGain = shortPut.probOTM - shortCall.probITM // same as (short call prob otm) - (short put prob itm)
        // console.log({probMaxTotalGain, maxTotalGain})
        const expectedMaxGain = maxTotalGain * probMaxTotalGain
        

        //find expected loss for call & put side
        //could be different for both sides. just find the expected loss for both sides

        const expectedCallMaxLoss = -((longCall.strike - shortCall.strike) * 100 - maxTotalGain) * longCall.probITM
        const expectedPutMaxLoss = -((shortPut.strike - longPut.strike) * 100 - maxTotalGain) * longPut.probITM
        
        // console.log({expectedCallMaxLoss, expectedPutMaxLoss}, expectedCallMaxLoss + expectedPutMaxLoss)

        // console.log(expectedPutMaxLoss + putTriangleExpectedReturn + expectedMaxGain + callTriangleExpectedReturn + expectedCallMaxLoss)
        // console.log({expectedPutMaxLoss,putTriangleExpectedReturn ,expectedMaxGain ,callTriangleExpectedReturn , expectedCallMaxLoss})

        const expectedReturn = (expectedPutMaxLoss + putTriangleExpectedReturn + expectedMaxGain + callTriangleExpectedReturn + expectedCallMaxLoss)  * quantity

        if (pricingType == "naturalExpectedVal") {
            naturalExpectedVal = expectedReturn
        } else {
            markExpectedVal = expectedReturn
        }
    });

    const evalResult = {
        strategy,
        naturalExpectedVal,
        markExpectedVal,
        quantity,
        collateral }
    
    return evalResult
}


function getTriangleExpectedReturns(shortLeg: OptionLeg, longLeg: OptionLeg, maxGain: number, type: "call" | "put" ): number {
        //find the breakeven

        const maxLoss = -Math.abs(shortLeg.strike - longLeg.strike) * 100 + maxGain
        const breakevenPrice = shortLeg.strike + maxGain * (type == "put" ? -1 : 1) / 100
        
       
        const totalDistance = Math.abs(shortLeg.strike - longLeg.strike)
        const longToBreakevenRatio = Math.abs(breakevenPrice - longLeg.strike) / totalDistance
        const shortToBreakevenRatio = 1 - longToBreakevenRatio

        // console.log({maxLoss, breakevenPrice, totalDistance, longToBreakevenRatio, shortToBreakevenRatio, maxGain})

        //all ratios are set, now get the loss and gain probabilities from the total (small) probability
        const totalProbability = shortLeg.probITM - longLeg.probITM

        const shortToBreakevenGain = maxGain / 2 // (base (width between strike & breakeven) * height (gain) / 2) / base to get it in P/L
        const longToBreakevenLoss = maxLoss / 2


        const expectedGain = shortToBreakevenGain * (totalProbability * shortToBreakevenRatio)
        const expectedLoss = longToBreakevenLoss * (totalProbability * shortToBreakevenRatio)

        return expectedGain + expectedLoss

}



type EvalResult = {
    strategy: CreditSpread | IronCondor
    naturalExpectedVal: number
    markExpectedVal: number
    quantity: number,
    collateral:number
}

const StrategyEvaluator = {evaluateCreditSpread, evaluateIronCondor}

export { StrategyEvaluator, EvalResult }