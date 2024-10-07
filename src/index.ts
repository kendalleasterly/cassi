import { NotionModel, systemSettings } from "./notion"
import { EvalResult } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Workers } from "./workers"



async function main( ticker: string, expDate: Date, maxLoss: number, maxCollateral: number, volatilityMultiplier: number) {

	const timeToExp = ((expDate.getTime() - (new Date()).getTime()) / (1000 * 60 * 60 * 24)) / 252
		
	const twelveDataModel = new TwelveDataModel(ticker, "5min", Math.round(12 * 6.5 * 3))

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
			return b.mark.expectedValue - a.mark.expectedValue
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


	const batchTime = String(new Date().getTime())
	const notionModel = new NotionModel(ticker, expDate, batchTime, SMA, meanVolatility)
	topResults.forEach(result => {
		notionModel.updateOrPushResult(result)
	})

	// evaluateCurrentPositions(ticker, expDate, SMA, meanVolatility, logVolatilityStats.mean, logVolatilityStats.stdDev, timeToExp, maxLoss, maxCollateral)

}



const ticker = "AAPL"
const expDate = new Date("9/20/2024, 16:00:00")
main(ticker, expDate, 200, 3000, 1)




