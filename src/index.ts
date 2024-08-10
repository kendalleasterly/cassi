import test from "node:test"
import { HTMLParser } from "./html-parser"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { StrategyEvaluator } from "./strategy-evaluator"

const testIronCondor: IronCondor = {
	longPut: {
		type: "put",
		strike: 138,
		bid: 0.05,
		ask: 0.07,
		probOTM: 1,
		probITM: 0,
	},
	shortPut: {
		type: "put",
		strike: 140,
		bid: 0.07,
		ask: 0.08,
		probOTM: 1,
		probITM: 0,
	},
	longCall: {
		type: "call",
		strike: 165,
		probITM: 1,
		probOTM: 0,
		bid: 3.85,
		ask: 3.95,
	},
	shortCall: {
		type: "call",
		strike: 162.5,
		probITM: 1,
		probOTM: 0,
		bid: 5.7,
		ask: 5.8,
	},
}

function main(
	ticker: string,
	maxCollateral: number,
	currentPrice: number,
	IV: number,
	timeToExp: number
) {
	const { callOptions, putOptions } = HTMLParser.parseHTML(
		`Trade ${ticker} _ thinkorswim Web`
	)
	const strategyBuilder = new StrategyBuilder(
		currentPrice,
		IV,
		timeToExp,
		putOptions,
		callOptions,
		maxCollateral
	)

	// console.log(
	// 	strategyBuilder.stockPriceCDF(currentPrice, 138.13, 164.37, 0.055)
	// )

	console.log("running...")
	const allCreditSpreads = strategyBuilder.findBestCreditSpread()
	const allIronCondors = strategyBuilder.findBestIronCondor()

	const { topMarkStrategies, topNaturalStrategies } =
		strategyBuilder.getTopNaturalAndMark(
			[...allCreditSpreads, ...allIronCondors],
			8
		)

	// - - - Test Functions - - -
	// StrategyBuilder.gammaAdjustmentForTrueExpectedValue()
}

main("AAPL", 1000, 215.51, 0.28, 5 / 252)
