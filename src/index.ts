import test from "node:test"
import { HTMLParser } from "./html-parser"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { StrategyEvaluator } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"

// const testIronCondor: IronCondor = {
// 	longPut: {
// 		type: "put",
// 		strike: 138,
// 		bid: 0.05,
// 		ask: 0.07,
// 		probOTM: 1,
// 		probITM: 0,
// 	},
// 	shortPut: {
// 		type: "put",
// 		strike: 140,
// 		bid: 0.07,
// 		ask: 0.08,
// 		probOTM: 1,
// 		probITM: 0,
// 	},
// 	longCall: {
// 		type: "call",
// 		strike: 165,
// 		probITM: 1,
// 		probOTM: 0,
// 		bid: 3.85,
// 		ask: 3.95,
// 	},
// 	shortCall: {
// 		type: "call",
// 		strike: 162.5,
// 		probITM: 1,
// 		probOTM: 0,
// 		bid: 5.7,
// 		ask: 5.8,
// 	},
// }

function getTopStrategies(ticker: string, maxCollateral: number, currentPrice: number, volatility: number, timeToExp: number) {

	const { callOptions, putOptions } = HTMLParser.parseHTML(`Trade ${ticker} _ thinkorswim Web`)

	const strategyBuilder = new StrategyBuilder(currentPrice, volatility, timeToExp, putOptions, callOptions, maxCollateral)

	const allCreditSpreads = strategyBuilder.findBestCreditSpread()
	const allIronCondors = strategyBuilder.findBestIronCondor()

	const { topMarkStrategies, topNaturalStrategies } = strategyBuilder.getTopNaturalAndMark([...allCreditSpreads, ...allIronCondors], 8)


}

async function main(ticker: string, time: number) {


	const twelveDataModel = new TwelveDataModel(ticker, "5min", 12 * 6.5 * 1 )

	const stats = await twelveDataModel.getVolatilityLogDistribution()
	const meanVolatility = Math.exp(stats.mean)
	console.log({meanVolatility})
	
	const SMAs = await twelveDataModel.getAvgPrices("1h", 1)
	const SMA = Object.values(SMAs)[0]
	console.log({SMA})

	getTopStrategies(ticker, 1000, SMA, meanVolatility, time)
	// getTopStrategies("AAPL", 1000, 215, 0.24, 5 / 252)
}


main("AAPL", 3 / 252)
// getTopStrategies("AAPL", 1000, 217.2, .32, 3/252)




