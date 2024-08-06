import { HTMLParser } from "./html-parser"
import { CreditSpread, IronCondor, StrategyBuilder } from "./strategy-builder"
import { StrategyEvaluator } from "./strategy-evaluator"

const fileName = "Trade AAPL _ thinkorswim Web"

const meta435510 = StrategyEvaluator.evaluateIronCondor(
	{
		longCall: {
			type: "call",
			strike: 515,
			isOTM: true,
			gamma: 0.0062,
			probITM: 0.1754,
			probOTM: 0.8245999999999999,
			bid: 5.08,
			ask: 5.08,
		},
		shortCall: {
			type: "call",
			strike: 510,
			isOTM: true,
			gamma: 0.0067,
			probITM: 0.20440000000000003,
			probOTM: 0.7956,
			bid: 6.13,
			ask: 6.13,
		},

		shortPut: {
			type: "put",
			strike: 435,
			isOTM: true,
			bid: 5.33,
			ask: 5.33,
			probOTM: 0.7803,
			probITM: 0.21969999999999998,
			gamma: 0.0056,
		},
		longPut: {
			type: "put",
			strike: 430,
			isOTM: true,
			bid: 4.33,
			ask: 4.33,
			probOTM: 0.8133,
			probITM: 0.1867,
			gamma: 0.0051,
		}
	},
	1000
)

// console.log(meta435510)

const meta427507 = StrategyEvaluator.evaluateIronCondor(
	{
		longCall: {
			type: "call",
			strike: 522.5,
			isOTM: true,
			gamma: 0.0054,
			probITM: 0.1374,
			probOTM: 0.8626,
			bid: 3.77,
			ask: 3.77,
		},
		shortCall: {
			type: "call",
			strike: 507.5,
			isOTM: true,
			gamma: 0.007,
			probITM: 0.21969999999999998,
			probOTM: 0.7803,
			bid: 6.68,
			ask: 6.68,
		},

		shortPut: {
			type: "put",
			strike: 427.5,
			isOTM: true,
			bid: 4.03,
			ask: 4.03,
			probOTM: 0.8284,
			probITM: 0.1716,
			gamma: 0.0048,
		},
		longPut: {
			type: "put",
			strike: 417.5,
			isOTM: true,
			bid: 2.54,
			ask: 2.54,
			probOTM: 0.8809,
			probITM: 0.1191,
			gamma: 0.0036,
		}
	},
	1500
)

// console.log(meta427507)

// const ironCondorResult2 = StrategyEvaluator.evaluateIronCondor({
//   longCall: {
//     type: 'call',
//       strike: 205,
//       isOTM: true,
//       gamma: 0.0131,
//       probITM: 0.1011,
//       probOTM: 0.8989,
//       bid: 0.79,
//       ask: 0.82
//     },
//   shortCall: {
//     type: 'call',
//       strike: 202.5,
//       isOTM: true,
//       gamma: 0.0157,
//       probITM: 0.13470000000000001,
//       probOTM: 0.8653,
//       bid: 1.12,
//       ask: 1.17
//     },

//   shortPut: {
//     type: 'put',
//       strike: 172.5,
//       isOTM: true,
//       bid: 1.79,
//       ask: 1.85,
//       probOTM: 0.785,
//       probITM: 0.215,
//       gamma: 0.0162
//     },
//   longPut: {
//     type: 'put',
//     strike: 170,
//     isOTM: true,
//     bid: 1.33,
//     ask: 1.38,
//     probOTM: 0.8281999999999999,
//     probITM: 0.1718,
//     gamma: 0.014
//   }
// }, 1000)

// console.log({ironCondorResult2})

const testIronCondor: CreditSpread = {
	type: "put",
	shortLeg: {
		type: 'put',
      strike: 207.5,
      isOTM: true,
      bid: 0.62,
      ask: 0.69,
      probOTM: 0.8694,
      probITM: 0.1306,
      gamma: 0.0188
	},
	longLeg: {
		type: 'put',
		strike: 202.5,
		isOTM: true,
		bid: 0.28,
		ask: 0.32,
		probOTM: 0.9345,
		probITM: 0.0655,
		gamma: 0.0103
    }
}

const { callOptions, putOptions } = HTMLParser.parseHTML(fileName)
// console.log({ callOptions, putOptions })

// const {topMarkStrategies, topNaturalStrategies} =  StrategyBuilder.findBestIronCondor(putOptions, callOptions, 2000, 4)
// console.log(topMarkStrategies, topNaturalStrategies)

// StrategyBuilder.gammaSimulation(
// 	{
// 		type: "put",
// 		strike: 202.5,
// 		isOTM: true,
// 		bid: 0.28,
// 		ask: 0.32,
// 		probOTM: 0.9345,
// 		probITM: 0.0655,
// 		gamma: 0.0103,
// 	},
// 	219.28,
// 	200,
// 	{ putOptions, callOptions }
// )

const result = StrategyBuilder.gammaAdjustmentForResilience(testIronCondor, 219.28, 8.294, 1, {callOptions, putOptions})
console.log(result)
