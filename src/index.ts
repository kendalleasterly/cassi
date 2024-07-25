import { HTMLParser } from "./html-parser"
import { StrategyEvaluator } from "./strategy-evaluator"

const fileName = "Trade RILY _ thinkorswim Web"

const ironCondorResult1 = StrategyEvaluator.evaluateIronCondor({
    longCall: {
        type: 'call',
        strike: 260,
        isOTM: true,
        gamma: 0.0073,
        probITM: 0.2097,
        probOTM: 0.7903,
        bid: 6.05,
        ask: 6.25
      },
    shortCall: {
        type: 'call',
        strike: 250,
        isOTM: true,
        gamma: 0.008,
        probITM: 0.27140000000000003,
        probOTM: 0.7286,
        bid: 8.4,
        ask: 8.6
      }, 

    shortPut: {
        type: 'put',
        strike: 195,
        isOTM: true,
        bid: 6.6,
        ask: 6.85,
        probOTM: 0.7193999999999999,
        probITM: 0.28059999999999996,
        gamma: 0.0067
      },
    longPut: {
        type: 'put',
        strike: 185,
        isOTM: true,
        bid: 4.4,
        ask: 4.6,
        probOTM: 0.7897,
        probITM: 0.21030000000000001,
        gamma: 0.0053
      },
    ticker: "AAPL"
}, 1000) 

console.log(ironCondorResult1)

// const ironCondorResult2 = StrategyEvaluator.evaluateIronCondor({
//   longCall: {
//     type: 'call',
//     strike: 19,
//     isOTM: true,
//     gamma: 0.0767,
//     probITM: 0.0625,
//     probOTM: 0.9375,
//     bid: 0,
//     ask: 0.05
//     },
//   shortCall: {
//     type: 'call',
//     strike: 18.5,
//     isOTM: true,
//     gamma: 0.1373,
//     probITM: 0.1353,
//     probOTM: 0.8647,
//     bid: 0.05,
//     ask: 0.1
//     }, 

//   shortPut: {
//     type: 'put',
//     strike: 16.5,
//     isOTM: true,
//     bid: 0.25,
//     ask: 0.35,
//     probOTM: 0.6639,
//     probITM: 0.3361,
//     gamma: 0.3095
//     },
//   longPut: {
//     type: 'put',
//     strike: 16,
//     isOTM: true,
//     bid: 0.15,
//     ask: 0.25,
//     probOTM: 0.7793000000000001,
//     probITM: 0.2207,
//     gamma: 0.2748
//   },
//   ticker: "RILY"
// }, 1000) 

// console.log({ironCondorResult2})


// console.log(HTMLParser.parseHTML(fileName))
