import { NotionModel, systemSettings } from "./notion"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Workers } from "./workers"
import * as mathjs from 'mathjs';



async function main( ticker: string, expDate: Date, maxLoss: number, maxCollateral: number, volatilityMultiplier: number) {

	const timeToExp = ((expDate.getTime() - (new Date()).getTime()) / (1000 * 60 * 60 * 24)) / 252
		
	const twelveDataModel = new TwelveDataModel(ticker, "5min", Math.round(12 * 6.5 * 5)) // min in hour, hour in days, days

	let { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats, SMA } = await twelveDataModel.getVolatilityLogDistribution()
	
	// - - MARK: Testing only - - 

	// let { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats, SMA } = {meanVolatility: 2.2683253138292128, logVolatilityStats: { mean: 0.6073731187596693, stdDev: 0.6154871380642603 }, SMA: 31}
	
	// - - End Testing - - 
	SMA = 32

	let meanVolatility = rawMeanVolatility * volatilityMultiplier
	let logVolatilityStats = {
		mean: rawLogVolatilityStats.mean + Math.log(volatilityMultiplier),
		stdDev: rawLogVolatilityStats.stdDev + Math.log(volatilityMultiplier)
	}

	// console.log({ SMA, timeToExp, volatilityMultiplier, meanVolatility, logVolatilityStats })
	
	// const params = {ticker, maxLoss,maxCollateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}
	// const {topNaturalResults} = await Workers.workersGetTopResults(params, 25)

	// let topResults: EvalResult[] = []

	// if (systemSettings.sortingMethod == "Top_Mark_of_Top_Natural") {

	// 	topResults = [...topNaturalResults].sort((a, b) => {
	// 		return b.mark.expectedValue - a.mark.expectedValue
	// 	})
	// } else if (systemSettings.sortingMethod == "Top_Natural") {

	// 	topResults = [...topNaturalResults]
	// }
	
	// const outputLimit = 15
	// topResults = topResults.slice(0, outputLimit)
	// topResults.forEach((result, _) => console.log(result))

	// const date = new Date()
	// const batchID = `${ticker} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} ${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`
	// const notionModel = new NotionModel(ticker, expDate, batchID, SMA, meanVolatility)
	// topResults.forEach(result => {
	// 	notionModel.updateOrPushResult(result)
	// })

	evaluateCurrentPositions(ticker, expDate, SMA, meanVolatility, logVolatilityStats.mean, logVolatilityStats.stdDev, timeToExp, maxLoss, maxCollateral)

	
	// - - - MARK: Testing Zone - - - 

	// const evaluator = new StrategyEvaluator(SMA, rawMeanVolatility, rawLogVolatilityStats.mean, rawLogVolatilityStats.stdDev, timeToExp, maxLoss, maxCollateral)

	// const testStrategy: CreditSpread =  {
	// 	shortLeg: { type: 'call', strike: 24, bid: 18.05, ask: 18.35 },
	// 	longLeg: { type: 'call', strike: 28, bid: 15.4, ask: 15.7 },
	// 	type: 'call',
	// 	strategyType: 'credit spread'
	//   }

	

	// console.log(evaluator.evaluateCreditSpread(testStrategy, rawMeanVolatility))



}



const ticker = "DJT"
const expDate = new Date("11/8/2024, 16:00:00")
main(ticker, expDate, -100, 1000, 1)










// 	// get all of your current positions

// 	// change their bid and ask to output the credit you revieved

async function evaluateCurrentPositions(ticker: string, expDate: Date, currentPrice: number, meanVolatility: number, meanLogVol: number, logVolStdDev: number, timeToExp: number, maxLoss: number, maxCollateral: number) {

	const notionModel = new NotionModel(ticker, expDate, "", currentPrice, meanVolatility)

	const strategies = await notionModel.getOpenPositions()
	console.log(strategies)

	const strategyEvaluator = new StrategyEvaluator(currentPrice, meanVolatility, meanLogVol, logVolStdDev, timeToExp, maxLoss, maxCollateral)

	strategies.forEach(strategyInfo => {
		// get the natural expected value
		const strategy = strategyInfo.strategy
		let currentEvalResult = strategyEvaluator.getVolatilityExpectedValue(strategy)

		let templateQuantity = currentEvalResult.natural.quantity

		console.log({templateQuantity}, currentEvalResult.natural)

		currentEvalResult.natural.expectedGainComponent.expectedValue = (currentEvalResult.natural.expectedGainComponent.expectedValue / templateQuantity) * strategyInfo.currentQuantity
		currentEvalResult.natural.expectedLossComponent.expectedValue = (currentEvalResult.natural.expectedLossComponent.expectedValue / templateQuantity) * strategyInfo.currentQuantity
		currentEvalResult.natural.expectedValue = (currentEvalResult.natural.expectedValue / templateQuantity) * strategyInfo.currentQuantity

		console.log("After Adjustment:", currentEvalResult.natural)

		notionModel.updateCurrentExpectedValues(strategyInfo.pageID, currentEvalResult)
	})
}





