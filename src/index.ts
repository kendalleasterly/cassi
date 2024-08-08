import test from "node:test"
import { HTMLParser } from "./html-parser"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { StrategyEvaluator } from "./strategy-evaluator"


function main(ticker: string, maxCollateral:number, currentPrice: number, IV: number, timeToExp: number) {

	const {callOptions, putOptions } = HTMLParser.parseHTML(`Trade ${ticker} _ thinkorswim Web`)
	const strategyBuilder = new StrategyBuilder(currentPrice, IV, timeToExp, putOptions, callOptions, maxCollateral)

	// const {topMarkStrategies} =  StrategyBuilder.findBestCreditSpread(Object.values(putOptions), "put", 3, currentPrice, IV, {callOptions, putOptions}, maxCollateral, timeToExp)

	// const {} =  strategyBuilder.findBestIronCondor(3)
	const allCreditSpreads = strategyBuilder.findBestCreditSpread(4)
	const allIronCondors = strategyBuilder.findBestIronCondor(4)

	const {topMarkStrategies, topNaturalStrategies} = strategyBuilder.getTopNaturalAndMark([...allCreditSpreads, ...allIronCondors], 4)


	

	// - - - Test Functions - - -
	// StrategyBuilder.gammaAdjustmentForTrueExpectedValue()

}

main("AAPL", 1000, 210.96, .4, 1/252)


