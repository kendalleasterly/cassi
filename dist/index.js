"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const html_parser_1 = require("./html-parser");
const strategy_builder_1 = require("./strategy-builder");
// const meta435510 = StrategyEvaluator.evaluateIronCondor(
// 	{
// 		longCall: {
// 			type: "call",
// 			strike: 515,
// 			isOTM: true,
// 			gamma: 0.0062,
// 			probITM: 0.1754,
// 			probOTM: 0.8245999999999999,
// 			bid: 5.08,
// 			ask: 5.08,
// 		},
// 		shortCall: {
// 			type: "call",
// 			strike: 510,
// 			isOTM: true,
// 			gamma: 0.0067,
// 			probITM: 0.20440000000000003,
// 			probOTM: 0.7956,
// 			bid: 6.13,
// 			ask: 6.13,
// 		},
// 		shortPut: {
// 			type: "put",
// 			strike: 435,
// 			isOTM: true,
// 			bid: 5.33,
// 			ask: 5.33,
// 			probOTM: 0.7803,
// 			probITM: 0.21969999999999998,
// 			gamma: 0.0056,
// 		},
// 		longPut: {
// 			type: "put",
// 			strike: 430,
// 			isOTM: true,
// 			bid: 4.33,
// 			ask: 4.33,
// 			probOTM: 0.8133,
// 			probITM: 0.1867,
// 			gamma: 0.0051,
// 		}
// 	},
// 	1000
// )
// console.log(meta435510)
// const meta427507 = StrategyEvaluator.evaluateIronCondor(
// 	{
// 		longCall: {
// 			type: "call",
// 			strike: 522.5,
// 			isOTM: true,
// 			gamma: 0.0054,
// 			probITM: 0.1374,
// 			probOTM: 0.8626,
// 			bid: 3.77,
// 			ask: 3.77,
// 		},
// 		shortCall: {
// 			type: "call",
// 			strike: 507.5,
// 			isOTM: true,
// 			gamma: 0.007,
// 			probITM: 0.21969999999999998,
// 			probOTM: 0.7803,
// 			bid: 6.68,
// 			ask: 6.68,
// 		},
// 		shortPut: {
// 			type: "put",
// 			strike: 427.5,
// 			isOTM: true,
// 			bid: 4.03,
// 			ask: 4.03,
// 			probOTM: 0.8284,
// 			probITM: 0.1716,
// 			gamma: 0.0048,
// 		},
// 		longPut: {
// 			type: "put",
// 			strike: 417.5,
// 			isOTM: true,
// 			bid: 2.54,
// 			ask: 2.54,
// 			probOTM: 0.8809,
// 			probITM: 0.1191,
// 			gamma: 0.0036,
// 		}
// 	},
// 	1500
// )
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
const testCreditSpread = {
    type: "put",
    shortLeg: {
        type: 'put',
        strike: 205,
        isOTM: true,
        bid: 3,
        ask: 3.1,
        probOTM: 0.5293,
        probITM: 0.4707,
        gamma: 0.0457
    },
    longLeg: {
        type: 'put',
        strike: 185,
        isOTM: true,
        bid: 0.19,
        ask: 0.2,
        probOTM: 0.9564,
        probITM: 0.0436,
        gamma: 0.0067
    }
};
function main(ticker, maxCollateral, currentPrice, IV, timeToExp) {
    const { callOptions, putOptions } = html_parser_1.HTMLParser.parseHTML(`Trade ${ticker} _ thinkorswim Web`);
    // const {topMarkStrategies} =  StrategyBuilder.findBestCreditSpread(Object.values(putOptions), "put", 3, currentPrice, IV, {callOptions, putOptions}, maxCollateral, timeToExp)
    console.log("finding best iron condor");
    const {} = strategy_builder_1.StrategyBuilder.findBestIronCondor(3, currentPrice, IV, { putOptions, callOptions }, maxCollateral, timeToExp);
    // console.log(topMarkStrategies[0])
    // console.log(" - - - starting simulation - - - ")
}
main("AAPL", 1000, 210.34, .3397, 3 / 252);
// console.log({ callOptions, putOptions })
// StrategyBuilder.findBestCreditSpread(Object.values(putOptions), "put", 1000, 3).topMarkStrategies.forEach((val) => console.log(val))
// console.log(result)
