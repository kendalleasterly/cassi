import { OptionLeg } from "./html-parser"
import { buildTopStrategies, CreditSpread, getTopResults, GetTopStrategiesParameters, IronCondor } from "./strategy-builder"
import { EvalResult } from "./strategy-evaluator"

import os from "os"
const numCores = os.cpus().length
import { Worker, isMainThread, parentPort, workerData } from "worker_threads"

if (parentPort) {
    parentPort.on("message", (message) => {
        const parentMessage: ThreadMessage = message
    
        const getTopStratsParams = parentMessage.payload as GetTopStrategiesParameters
    
        const results = buildTopStrategies(getTopStratsParams)
    
        parentPort!.postMessage({type: "data", payload: results})
        
    })
}

function workersGetTopResults(getTopStrategiesPrams: GetTopStrategiesParameters, limit: number): Promise<{topNaturalResults: EvalResult[], topMarkResults: EvalResult[]}> {

    return new Promise((resolve, reject) => {

        let workersReturned = 0

	let allTopNaturalResults: {[key: string]: EvalResult} = {}
	let allTopMarkResults: {[key: string]: EvalResult} = {}

	startWorkersWith( getTopStrategiesPrams, 
		(workerMessage) => {

			workersReturned++

			const {topMarkResults, topNaturalResults} = workerMessage.payload as {topMarkResults: EvalResult[], topNaturalResults: EvalResult[]}

			function formatTopResults(topResults: EvalResult[]): {[key: string]: EvalResult} {

				let topResultsDictionary: {[key: string]: EvalResult} = {}
				
				topResults.forEach(evalResult => {

					let id = ""
	
					if (Object.keys(evalResult.strategy).includes("type")) {  // it's a credit spread 
	
						const creditSpread = evalResult.strategy as CreditSpread
						id = `${creditSpread.shortLeg.strike}-${creditSpread.longLeg.strike}-${creditSpread.type}`
					} else {
	
						const ironCondor = evalResult.strategy as IronCondor
	
						id = `${ironCondor.longPut.strike}-${ironCondor.shortPut.strike}-${ironCondor.shortCall.strike}-${ironCondor.longCall.strike}`
					}
	
					topResultsDictionary[id] = evalResult
	
				})

				return topResultsDictionary
			}

			// We format it to a dictionary and then back to an array to get rid of duplicates
			const formattedTopMark = formatTopResults(topMarkResults)
			const formattedTopNatural = formatTopResults(topNaturalResults)

			allTopMarkResults = {...allTopMarkResults, ...formattedTopMark}
			allTopNaturalResults = {...allTopNaturalResults, ...formattedTopNatural}
			

			if (workersReturned == numCores) {

				console.log({workersReturned})

                const allTopResults = getTopResults([...Object.values(allTopNaturalResults),...Object.values(allTopMarkResults) ], limit)

                resolve(allTopResults)
			}
		}
	)
    })
}

function startWorkersWith(getTopStratsParams: GetTopStrategiesParameters, callback: (arg0: ThreadMessage) => void) { // Use callback and not await, because we have multiple 
	
	
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

type ThreadMessage = {
	type: "data" | "new_work"
	payload: {topMarkResults: EvalResult[], topNaturalResults: EvalResult[]} | GetTopStrategiesParameters
}



const Workers = {workersGetTopResults, startWorkersWith, getLegsForWorker}

export {Workers, GetTopStrategiesParameters}