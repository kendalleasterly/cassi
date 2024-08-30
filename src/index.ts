import { HTMLParser, OptionLeg } from "./html-parser"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { EvalResult, StrategyEvaluator } from "./strategy-evaluator"
import { TwelveDataModel } from "./twelve-data"
import { Worker, isMainThread, parentPort, workerData } from "worker_threads"
import os from "os"
const numCores = os.cpus().length


// We put the parameters for this function into an object because these are getting passed around as messages from Main thread to worker thread
function getTopStrategies(p: GetTopStrategiesParameters) {
	const { callOptions, putOptions } = HTMLParser.parseHTML(
		`Trade ${p.ticker} _ thinkorswim Web`
	)

	const strategyBuilder = new StrategyBuilder(p.currentPrice, p.meanVolatility, p.meanLogVolatility, p.stdDevLogVolatility, p.timeToExp, putOptions, callOptions, p.maxLoss, p.maxCollateral)
	
	const allCreditSpreads = strategyBuilder.findBestCreditSpread()

	// 	get the all of the put options that are in bounds
	// give the function the starting put options

	const feasiblePutOptions: OptionLeg[] = []

	Object.values({...putOptions}).forEach(optionLeg => {

		if (strategyBuilder.isInBounds(optionLeg.strike)) feasiblePutOptions.push(optionLeg) 

	})

	const currentOptionLegs = getLegsForWorker(p.workerIndex, feasiblePutOptions)
	const allIronCondors = strategyBuilder.findBestIronCondor(currentOptionLegs)

	const { topMarkResults, topNaturalResults } = getTopResults( [...allCreditSpreads, ...allIronCondors], 8 )

	console.log( strategyBuilder.strategiesEvaluatedVol, strategyBuilder.strategiesEvaluatedStockPrice )

	return {topMarkResults, topNaturalResults}

	// - - - MARK: Testing Zone - - -

	function getLegsForWorker(workerIndex: number, allValues: OptionLeg[]): OptionLeg[] {
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

}

function getTopResults(allStratagies: EvalResult[], limit: number) {
    let topNaturalResults = [...allStratagies]
    let topMarkResults = [...allStratagies]

    topNaturalResults.sort((a, b) => {
        return b.natural.expectedValue - a.natural.expectedValue
    })

    topMarkResults.sort((a, b) => {
        return b.mark.expectedValue - a.mark.expectedValue
    })

    topNaturalResults = topNaturalResults.slice(0, limit)
    topMarkResults = topMarkResults.slice(0, limit)

    return {topNaturalResults, topMarkResults}
}



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


	let workersReturned = 0

	let allTopNaturalResults: {[key: string]: EvalResult} = {}
	let allTopMarkResults: {[key: string]: EvalResult} = {}

	startWorkersWith( {ticker, maxLoss,maxCollateral, currentPrice: SMA, meanVolatility, meanLogVolatility: logVolatilityStats.mean, stdDevLogVolatility: logVolatilityStats.stdDev, timeToExp,  workerIndex: -1}, 
		(message) => {
			const {topMarkResults, topNaturalResults} = message.payload as {topMarkResults: EvalResult[], topNaturalResults: EvalResult[]}

			topMarkResults.forEach(evalResult => {

				let id = ""

				if (Object.keys(evalResult.strategy).includes("type")) {  // it's a credit spread 

					const creditSpread = evalResult.strategy as CreditSpread
					id = `${creditSpread.shortLeg.strike}-${creditSpread.longLeg.strike}-${creditSpread.type}`
				} else {

					const ironCondor = evalResult.strategy as IronCondor

					id = `${ironCondor.longPut.strike}-${ironCondor.shortPut.strike}-${ironCondor.shortCall.strike}-${ironCondor.longCall.strike}`
				}


				allTopMarkResults[id] = evalResult

				
			})

			topNaturalResults.forEach(evalResult => {

				let id = ""

				if (Object.keys(evalResult.strategy).includes("type")) {  // it's a credit spread 

					const creditSpread = evalResult.strategy as CreditSpread
					id = `${creditSpread.shortLeg.strike}-${creditSpread.longLeg.strike}-${creditSpread.type}`
				} else {

					const ironCondor = evalResult.strategy as IronCondor
					id = `${ironCondor.longPut.strike}-${ironCondor.shortPut.strike}-${ironCondor.shortCall.strike}-${ironCondor.longCall.strike}`
				}


				allTopNaturalResults[id] = evalResult

			})
			

			workersReturned++

			if (workersReturned == numCores) {

				console.log({workersReturned})

				const limit = 4

				console.log("- - - NATURAL - - - ")
				getTopResults([...Object.values(allTopNaturalResults),...Object.values(allTopMarkResults) ], limit).topNaturalResults.forEach((result, _) => console.log(result))
				console.log("- - - MARK - - - ")
				getTopResults([...Object.values(allTopNaturalResults),...Object.values(allTopMarkResults) ], limit).topMarkResults.forEach((result, _) => console.log(result))
			}
			
		}
	)
	
}



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

	main("NVDA", 2 / 252, 200, 4000, 1.75)

} else if (parentPort) {
	
	parentPort.on("message", (message) => {
		const parentMessage: ThreadMessage = message

		const getTopStratsParams = parentMessage.payload as GetTopStrategiesParameters

		const results = getTopStrategies(getTopStratsParams)

		parentPort!.postMessage({type: "data", payload: results})
		
	})
	
}


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