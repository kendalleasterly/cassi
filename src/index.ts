import { HTMLParser, OptionLeg } from "./html-parser"
import { CreditSpread, getTopResults, IronCondor, StrategyBuilder } from "./strategy-builder"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Worker, isMainThread, parentPort, workerData } from "worker_threads"
import os from "os"
const numCores = os.cpus().length

const testStrategy: CreditSpread = {
	shortLeg: {
		type: "call",
		strike: 222.5,
		probITM: 1,
		probOTM: 0,
		bid: 1.62,
		ask: 1.66,
	},
	longLeg: {
		type: "call",
		strike: 225,
		probITM: 0.9999999999999999,
		probOTM: 1.1102230246251565e-16,
		bid: 0.74,
		ask: 0.78,
	},
	type: "call",
}

function getTopStrategies(params: GetTopStrategiesParameters) {
	const { callOptions, putOptions } = HTMLParser.parseHTML(
		`Trade ${params.ticker} _ thinkorswim Web`
	)

	const strategyBuilder = new StrategyBuilder( params.currentPrice, params.meanVolatility, params.meanLogVolatility, params.stdDevLogVolatility, params.timeToExp, putOptions, callOptions, params.maxLoss, params.maxCollateral)

	console.log("finding best credit spreads...")
	const allCreditSpreads = strategyBuilder.findBestCreditSpread()
	console.log("worker", params.workerIndex, "is finding best iron condor...")

	//get the all of the put options that are in bounds
	// give the function the starting put options

	const feasiblePutOptions: OptionLeg[] = []

	Object.values({...putOptions}).forEach(optionLeg => {

		if (strategyBuilder.isInBounds(optionLeg.strike)) feasiblePutOptions.push(optionLeg) 

	})

	const currentOptionLegs = getLegsForWorker(params.workerIndex, feasiblePutOptions)

	const allIronCondors = strategyBuilder.findBestIronCondor(currentOptionLegs)

	const { topMarkResults, topNaturalResults } = getTopResults( [...allCreditSpreads, ...allIronCondors], 8 )

	console.log( strategyBuilder.strategiesEvaluatedVol, strategyBuilder.strategiesEvaluatedStockPrice )

	return {topMarkResults, topNaturalResults}

	// - - - MARK: Testing Zone - - -

}

function getLegsForWorker(workerIndex: number, allValues: OptionLeg[]) {
	// Very inefficient, but doesn't matter as this will have like 50-75 values maximum (which happens once on each thread)

	let legAssignments: {[key: number]: OptionLeg[]} = {}

	for (let i = 0; i < numCores; i++) {
		legAssignments[i] = []
	}

	let stack = allValues

	while (stack.length > 0) {
		for (let i = 0; i < numCores; i++) {

			let currLeg = stack.pop()

			if (currLeg == undefined) continue

			legAssignments[i].push(currLeg)
			
		}
	}

	return legAssignments[workerIndex]
}

async function main( ticker: string, timeToExp: number, maxLoss: number, collateral: number) {
	const twelveDataModel = new TwelveDataModel(ticker, "5min", 12 * 6.5 * 4)

	const { meanVolatility, logVolatilityStats } =
		await twelveDataModel.getVolatilityLogDistribution()
	console.log({ meanVolatility })

	const SMAs = await twelveDataModel.getAvgPrices("1h", 1)
	const SMA = Object.values(SMAs)[0]
	console.log({ SMA })
	console.log({ logVolatilityStats })

	let workersReturned = 0

	let allTopNaturalResults: EvalResult[] = []
	let allTopMarkResults: EvalResult[] = []

	startWorkersWith( {ticker, maxLoss, maxCollateral: collateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}, 
		(message) => {
			const {topMarkResults, topNaturalResults} = message.payload as {topMarkResults: EvalResult[], topNaturalResults: EvalResult[]}

			allTopNaturalResults.push(...topNaturalResults)
			allTopMarkResults.push(...topMarkResults)

			workersReturned++
			console.log("received message!")

			if (workersReturned == numCores) {

				console.log({workersReturned})

				const limit = 8

				console.log("- - - NATURAL - - - ")
				getTopResults([...allTopNaturalResults,...allTopMarkResults ], limit).topNaturalResults.forEach((result, _) => console.log(result))
				console.log("- - - MARK - - - ")
				getTopResults([...allTopNaturalResults,...allTopMarkResults ], limit).topMarkResults.forEach((result, _) => console.log(result))
			}
			
		}
	)

	// - - - MARK: Testing - - -
	
}



// 53.65 seconds for 250
// 100.85 seconds for 500



function startWorkersWith(getTopStratsParams: GetTopStrategiesParameters, callback: (arg0: ThreadMessage) => void) {
	
	
	for (let i = 0; i < numCores; i++) {

		const worker = new Worker(__filename, { workerData: { workerId: i + 1 } })

		getTopStratsParams.workerIndex = i

		const message: ThreadMessage = {
			type: "new_work",
			payload: getTopStratsParams
		}

		worker.postMessage(message)
		worker.on("message", (val) => {
			callback(val as ThreadMessage)
		})
	}
}

if (isMainThread) {

	main("ASTS", 1 / 252, 250, 1000)

} else if (parentPort) {
	
	parentPort.on("message", (message) => {
		const parentMessage: ThreadMessage = message

		const getTopStratsParams = parentMessage.payload as GetTopStrategiesParameters

		const results = getTopStrategies(getTopStratsParams)

		parentPort!.postMessage({type: "data", payload: results})
		
	})
	
}

/// - - - MARK: Testing

// let testArr = []

// for (let i = 0; i < 55; i++) {
// 	testArr.push(i)
// }

// const num = 10
// const width = Math.ceil(testArr.length / num)


// for (let i = 0; i < num; i++) {

// 	if (i == num - 1) {
// 		console.log(testArr.slice(i * width))
// 	} else {
// 		console.log(testArr.slice(i * width, (i + 1) * width))
// 	}
	
// }






type ThreadMessage = {
	type: "data" | "new_work"
	payload: {topMarkResults: EvalResult[], topNaturalResults: EvalResult[]} | GetTopStrategiesParameters
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

// - - - MARK: Testing - - -
