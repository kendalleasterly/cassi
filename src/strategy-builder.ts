
import { HTMLParser, OptionChain, OptionLeg } from "./html-parser"
import { EvalResult, StrategyEvaluator, SubEvalResult } from "./strategy-evaluator"
import { Workers } from "./workers";


const RISK_FREE_RATE = 5.5 / 100

class StrategyBuilder {

    stdDevPrice: number
    strategiesEvaluatedVol: number = 0
    strategiesEvaluatedStockPrice: number = 0
    strategyEvaluator: StrategyEvaluator

    constructor(
        public currentPrice: number,
        public meanVolatility: number,
        public meanLogVol: number,
        public stdDevLogVol: number,
        public timeToExp: number,
        public putOptions: {[key: number]: OptionLeg},
        public callOptions: {[key: number]: OptionLeg},
        public maxAcceptableLoss: number,
        public maxCollateral: number
    ) {
        this.stdDevPrice = currentPrice * meanVolatility * Math.sqrt(timeToExp) // already converted to the time period
        this.strategyEvaluator = new StrategyEvaluator(currentPrice, meanVolatility, meanLogVol, stdDevLogVol, timeToExp, maxAcceptableLoss, maxCollateral )
    }

    


    isInBounds(strikePrice: number): boolean {
        const lowerBound = this.currentPrice - this.stdDevPrice * 5
        const upperBound = this.currentPrice + this.stdDevPrice * 5

        return strikePrice <= upperBound && strikePrice >= lowerBound
    }
    

    //
    findBestCreditSpreads(): EvalResult[] {

        let allStratagies: EvalResult[] = [];

        [this.putOptions, this.callOptions].forEach((optionLegsDict) => {

            const optionLegs = Object.values(optionLegsDict)
            const type = optionLegs[0].type
            

            optionLegs.forEach((shortLeg, _) => {
                
                if (!this.isInBounds(shortLeg.strike )) return
                
                
                optionLegs.forEach((longLeg, _) => {
        
                    
                    if (!this.isInBounds(longLeg.strike)) return
                    
        
                    if ((type == "put" && longLeg.strike >= shortLeg.strike) || (type == "call" && shortLeg.strike >= longLeg.strike)) return
    
                    
                    const strategy: CreditSpread = {shortLeg, longLeg, type, strategyType: "credit spread"}
    
                    let templateEvalResult = this.strategyEvaluator.evaluateCreditSpread(strategy, 0) // we do this to easily get the max collateral
    
                    if (templateEvalResult.collateral > this.maxCollateral) return
                    if (Math.abs(templateEvalResult.mark.maxLoss) > this.maxAcceptableLoss) return
                    
                    const evalResult = this.strategyEvaluator.getVolatilityExpectedValue(strategy)
                    
                    allStratagies.push(evalResult)  
                    
                })
            })
        })

        return allStratagies
    
    }
    
    findBestIronCondors(startingLongPuts: OptionLeg[]): EvalResult[] {
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
    
                        const strategy: IronCondor = {longPut, shortPut, longCall, shortCall, strategyType: "iron condor"}

                        let templateEvalResult = this.strategyEvaluator.evaluateIronCondor(strategy, 0)
                        if (templateEvalResult.collateral > this.maxCollateral) return
                        if (Math.abs(templateEvalResult.mark.maxLoss) > this.maxAcceptableLoss) return
    
                        const evalResult = this.strategyEvaluator.getVolatilityExpectedValue(strategy)

                        allStratagies.push(evalResult)
                        
                    })
                })
            })
        })
    
        return allStratagies
    }

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

// We put the parameters for this function into an object because these are getting passed around as messages from Main thread to worker thread
function buildTopStrategies(p: GetTopStrategiesParameters) {
    
	const { callOptions, putOptions } = HTMLParser.parseHTML(`Trade ${p.ticker} _ thinkorswim Web`)

	const strategyBuilder = new StrategyBuilder(p.currentPrice, p.meanVolatility, p.meanLogVolatility, p.stdDevLogVolatility, p.timeToExp, putOptions, callOptions, p.maxLoss, p.maxCollateral)
	const allCreditSpreads = strategyBuilder.findBestCreditSpreads()

	// 	get the all of the put options that are in bounds
	// give the function the starting put options

	const feasiblePutOptions: OptionLeg[] = []

	Object.values({...putOptions}).forEach(optionLeg => {

		if (strategyBuilder.isInBounds(optionLeg.strike)) feasiblePutOptions.push(optionLeg) 

	})

	const currentOptionLegs = Workers.getLegsForWorker(p.workerIndex, feasiblePutOptions)
	const allIronCondors = strategyBuilder.findBestIronCondors(currentOptionLegs)

	const { topMarkResults, topNaturalResults } = getTopResults( [...allCreditSpreads, ...allIronCondors], 8 )

	console.log( strategyBuilder.strategyEvaluator.strategiesEvaluatedVol )

	return {topMarkResults, topNaturalResults}

}

type GetTopStrategiesParameters = {
	ticker: string, 
	maxLoss: number,
	maxCollateral: number, 
	currentPrice: number, 
	meanVolatility: number, 
	meanLogVolatility: number, 
	stdDevLogVolatility: number, 
	timeToExp: number, 
	workerIndex: number
}

type Strategy = {
    strategyType: "iron condor" | "credit spread"
} 

type CreditSpread = Strategy & {
    shortLeg: OptionLeg
    longLeg: OptionLeg
    type: "put" | "call"
}

type IronCondor = Strategy & {
    longPut: OptionLeg
    shortPut: OptionLeg
    shortCall: OptionLeg
    longCall: OptionLeg
    
}

export {CreditSpread, IronCondor, StrategyBuilder, GetTopStrategiesParameters, getTopResults, buildTopStrategies}