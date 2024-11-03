import { NotionModel, systemSettings } from "./notion"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Workers } from "./workers"
import * as mathjs from 'mathjs';



async function main( ticker: string, expDate: Date, maxLoss: number, maxCollateral: number, volatilityMultiplier: number) {

	const timeToExp = ((expDate.getTime() - (new Date()).getTime()) / (1000 * 60 * 60 * 24)) / 252
		
	// const twelveDataModel = new TwelveDataModel(ticker, "5min", Math.round(12 * 6.5 * 3))

	// let { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats, SMA } = await twelveDataModel.getVolatilityLogDistribution()
	let { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats, SMA } = {meanVolatility: 1.2127785672404068, logVolatilityStats: { mean: -0.059399358464779804, stdDev: 0.6521987961114166 }, SMA: 26.434182435897448}

	// let meanVolatility = rawMeanVolatility * volatilityMultiplier
	// let logVolatilityStats = {
	// 	mean: rawLogVolatilityStats.mean + Math.log(volatilityMultiplier),
	// 	stdDev: rawLogVolatilityStats.stdDev + Math.log(volatilityMultiplier)
	// }

	// console.log({ SMA, timeToExp, volatilityMultiplier, meanVolatility, logVolatilityStats })
	
	// const params = {ticker, maxLoss,maxCollateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}
	// const {topNaturalResults} = await Workers.workersGetTopResults(params, 25)

	// let topResults: EvalResult[] = []

	// if (systemSettings.sortingMethod == "Top_Mark_of_Top_Natural") {

	// 	topResults = [...topNaturalResults].sort((a, b) => {
	// 		return b.mark.expectedValue - a.mark.expectedValue
	// 	})
	// } else if (systemSettings.sortingMethod == "Top_Natural") {

	// 	return [...topNaturalResults]
	// } else if (systemSettings.sortingMethod == "Top_Breakevens") {

	// 	topResults = [...topNaturalResults].sort((a, b) => {
	// 		return b.natural.breakEvens[0] - a.natural.breakEvens[0]
	// 	})
	// }
	
	// const outputLimit = 5
	// topResults = topResults.slice(0, outputLimit)

	// topResults.forEach((result, _) => console.log(result))


	// const batchTime = String(new Date().getTime())
	// const notionModel = new NotionModel(ticker, expDate, batchTime, SMA, meanVolatility)
	// topResults.forEach(result => {
	// 	notionModel.updateOrPushResult(result)
	// })

	// evaluateCurrentPositions(ticker, expDate, SMA, meanVolatility, logVolatilityStats.mean, logVolatilityStats.stdDev, timeToExp, maxLoss, maxCollateral)

	
	// - - - MARK: Testing Zone - - - 

	const evaluator = new StrategyEvaluator(SMA, rawMeanVolatility, rawLogVolatilityStats.mean, rawLogVolatilityStats.stdDev, timeToExp, maxLoss, maxCollateral)

	const testIronCondor: IronCondor =  {
	  longPut: { type: 'put', strike: 24, bid: 1.45, ask: 1.55 },
	  shortPut: { type: 'put', strike: 28, bid: 3.7, ask: 3.9 },
	  shortCall: { type: 'call', strike: 28.5, bid: 1.3, ask: 1.4 },
	  longCall: { type: 'call', strike: 29, bid: 1.15, ask: 1.25 },
	  strategyType: 'iron condor'
	}

	

	console.log(evaluator.evaluateIronCondor(testIronCondor, 1.091273508493915))



}



const ticker = "ASTS"
const expDate = new Date("11/5/2024, 16:00:00")
main(ticker, expDate, -200, 3000, 1)










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





