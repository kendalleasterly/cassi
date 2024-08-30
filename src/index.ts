import { EvalResult } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Workers } from "./workers"


async function main( ticker: string, timeToExp: number, maxLoss: number, maxCollateral: number, volatilityMultiplier: number) {
	const twelveDataModel = new TwelveDataModel(ticker, "5min", 12 * 6.5 * 21)

	const { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats } = await twelveDataModel.getVolatilityLogDistribution()

	let meanVolatility = rawMeanVolatility * volatilityMultiplier
	let logVolatilityStats = {
		mean: rawLogVolatilityStats.mean + Math.log(volatilityMultiplier),
		stdDev: rawLogVolatilityStats.stdDev + Math.log(volatilityMultiplier)
	}


	const SMAs = await twelveDataModel.getAvgPrices("1h", 1)
	const SMA = Object.values(SMAs)[0]
	
	console.log({ SMA, volatilityFactor: volatilityMultiplier, meanVolatility, logVolatilityStats })
	
	const allTopResults = await Workers.workersGetTopResults({ticker, maxLoss,maxCollateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}, 10)

	const topNaturalByMark = [...allTopResults.topNaturalResults].sort((a, b) => {
		return b.mark.expectedValue - a.mark.expectedValue
	})

	console.log("- - - NATURAL - - - ")

	const outputLimit = 4
	topNaturalByMark.slice(0, outputLimit).forEach((result, i) => console.log(result))
	
	console.log("- - - MARK - - - ")
	allTopResults.topMarkResults.slice(0, outputLimit).forEach((result, _) => console.log(result))

}

main("NVDA", 1 / 252, 200, 4000, 1)




