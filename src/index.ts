import { NotionModel } from "./notion"
import { IronCondor, StrategyBuilder } from "./strategy-builder"
import { EvalResult } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Workers } from "./workers"


async function main( ticker: string, timeToExp: number, maxLoss: number, maxCollateral: number, volatilityMultiplier: number) {
	const twelveDataModel = new TwelveDataModel(ticker, "5min", 12 * 6.5 * 12)

	const { meanVolatility: rawMeanVolatility, logVolatilityStats: rawLogVolatilityStats } = await twelveDataModel.getVolatilityLogDistribution()

	let meanVolatility = rawMeanVolatility * volatilityMultiplier
	let logVolatilityStats = {
		mean: rawLogVolatilityStats.mean + Math.log(volatilityMultiplier),
		stdDev: rawLogVolatilityStats.stdDev + Math.log(volatilityMultiplier)
	}


	const SMAs = await twelveDataModel.getAvgPrices("1h", 1)
	const SMA = Object.values(SMAs)[0]
	
	console.log({ SMA, volatilityFactor: volatilityMultiplier, meanVolatility, logVolatilityStats })

	const params = {ticker, maxLoss,maxCollateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}
	
	const {topMarkResults, topNaturalResults} = await Workers.workersGetTopResults(params, 15)

	const topNaturalByMark = [...topNaturalResults].sort((a, b) => {
		return b.mark.expectedValue - a.mark.expectedValue
	})

	const outputLimit = 5
	const topResults = topNaturalByMark.slice(0, outputLimit)

	topResults.forEach((result, _) => console.log(result))


}

// main("NVDA", 0.70923077 / 252, 100, 4000, 1)
// main("ASTS", 0.46153846 / 252, 100, 4000, 1)

// - - - MARK: Testing Zone - - - 



const testResult: EvalResult = {
	strategy: {
	  longPut: {
		type: 'put',
		strike: 23,
		bid: 0,
		ask: 0.05,
		probOTM: 0.611728865060338,
		probITM: 0.38827113493966203
	  },
	  shortPut: {
		type: 'put',
		strike: 24.5,
		bid: 0,
		ask: 0.1,
		probOTM: 0.5570166495726583,
		probITM: 0.4429833504273417
	  },
	  longCall: {
		type: 'call',
		strike: 29,
		probITM: 0.4085164423058173,
		probOTM: 0.5914835576941827,
		bid: 1.15,
		ask: 1.4
	  },
	  shortCall: {
		type: 'call',
		strike: 28,
		probITM: 0.47108539422697737,
		probOTM: 0.5289146057730226,
		bid: 2.8,
		ask: 3.6
	  }
	},
	quantity: 10,
	collateral: 100,
	mark: {
	  expectedValue: 177.5557409679693,
	  breakEvens: [ 22.55, 28.95 ],
	  price: 195,
	  maxLoss: -100
	},
	natural: {
	  expectedValue: -3.0481705776676407,
	  breakEvens: [ 23.15, 28.35 ],
	  price: 135,
	  maxLoss: -65
	}
  }


const testDate =  new Date("8/30/2024")

const notionModel = new NotionModel("ASTS",testDate)

notionModel.updateOrPushResult(testResult)
// notionModel.testFunction()

