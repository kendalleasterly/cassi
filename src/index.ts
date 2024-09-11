import { NotionModel, systemSettings } from "./notion"
import { CreditSpread, getExpectedValue, IronCondor, StrategyBuilder } from "./strategy-builder"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Workers } from "./workers"
import * as mathjs from 'mathjs';



async function main( ticker: string, expDate: Date, maxLoss: number, maxCollateral: number, volatilityMultiplier: number) {

	const timeToExp = ((expDate.getTime() - (new Date()).getTime()) / (1000 * 60 * 60 * 24)) / 252
		
	const twelveDataModel = new TwelveDataModel(ticker, "5min", Math.round(12 * 6.5 * .25))

	let { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats, SMA } = await twelveDataModel.getVolatilityLogDistribution()

	let meanVolatility = rawMeanVolatility * volatilityMultiplier
	let logVolatilityStats = {
		mean: rawLogVolatilityStats.mean + Math.log(volatilityMultiplier),
		stdDev: rawLogVolatilityStats.stdDev + Math.log(volatilityMultiplier)
	}

	console.log({ SMA, timeToExp, volatilityMultiplier, meanVolatility, logVolatilityStats })
	
	const params = {ticker, maxLoss,maxCollateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}
	const {topNaturalResults} = await Workers.workersGetTopResults(params, 25)

	let topResults: EvalResult[] = []

	if (systemSettings.sortingMethod == "Top_Mark_of_Top_Natural") {

		topResults = [...topNaturalResults].sort((a, b) => {
			return getExpectedValue(b.mark) - getExpectedValue(a.mark)
		})
	} else if (systemSettings.sortingMethod == "Top_Natural") {

		return [...topNaturalResults]
	} else if (systemSettings.sortingMethod == "Top_Breakevens") {

		topResults = [...topNaturalResults].sort((a, b) => {
			return b.natural.breakEvens[0] - a.natural.breakEvens[0]
		})
	}
	
	const outputLimit = 5
	topResults = topResults.slice(0, outputLimit)

	topResults.forEach((result, _) => console.log(result))


	// const batchTime = String(new Date().getTime())
	// const notionModel = new NotionModel(ticker, expDate, batchTime, SMA, meanVolatility)
	// topResults.forEach(result => {
	// 	notionModel.updateOrPushResult(result)
	// })

	// evaluateCurrentPositions(ticker, expDate, SMA, meanVolatility, logVolatilityStats.mean, logVolatilityStats.stdDev, timeToExp, maxLoss, maxCollateral)

	
	// - - - MARK: Testing Zone - - - 

	// const evaluator = new StrategyEvaluator(220.50955649999997, 0.21827436933820818, -1.5784282603227469, 0.35164686712569315, timeToExp, maxLoss, maxCollateral)

	// const testCreditSpread: CreditSpread = {
	// 	shortLeg: { type: 'call', strike: 197.5, bid: 23.7, ask: 23.95 },
	// 	longLeg: { type: 'call', strike: 200, bid: 21.2, ask: 21.45 },
	// 	type: 'call',
	// 	strategyType: 'credit spread'
	//   }

	// console.log(evaluator.getVolatilityExpectedValue(testCreditSpread))


}



const ticker = "AAPL"
const expDate = new Date("9/20/2024, 16:00:00")
main(ticker, expDate, 200, 3000, 1)








// 	// get all of your current positions

// 	// change their bid and ask to output the credit you revieved

// async function evaluateCurrentPositions(ticker: string, expDate: Date, currentPrice: number, meanVolatility: number, meanLogVol: number, logVolStdDev: number, timeToExp: number, maxLoss: number, maxCollateral: number) {

// 	const notionModel = new NotionModel(ticker, expDate, "", currentPrice, meanVolatility)

// 	const strategies = await notionModel.getOpenPositions()
// 	console.log(strategies)

// 	const strategyBuilder = new StrategyBuilder(currentPrice, meanVolatility, meanLogVol, logVolStdDev, timeToExp, {}, {}, maxLoss, maxCollateral)

// 	strategies.forEach(strategy => {
// 		let {expectedNaturalValue: currentEx} = strategyBuilder.getVolatilityExpectedValue(strategy.strategy)

// 		let templateQuantity = 0

// 		if (Object.keys(strategy.strategy).includes("type")) {

// 			templateQuantity = StrategyEvaluator.evaluateCreditSpread(strategy.strategy as CreditSpread, maxCollateral, maxLoss).natural.quantity

// 		} else {
// 			templateQuantity = StrategyEvaluator.evaluateIronCondor(strategy.strategy as IronCondor, maxCollateral, maxLoss).natural.quantity
// 		}

// 		console.log({templateQuantity, currentEx})
		
// 		currentEx = (currentEx / templateQuantity) * strategy.currentQuantity

// 		notionModel.updateCurrentExpectedValue(strategy.pageID, currentEx)
// 	})

	



// }

// - - - MARK: Testing Zone - - - 





