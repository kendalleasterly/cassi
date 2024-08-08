"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyBuilder = void 0;
const strategy_evaluator_1 = require("./strategy-evaluator");
const mathjs = __importStar(require("mathjs"));
const RISK_FREE_RATE = 3.78 / 100;
function findBestCreditSpread(optionLegs, type, limit, currentStockPrice, IV, optionChain, maxCollateral, timeToExp) {
    let allStratagies = [];
    //loop through all the potential SHORT put options
    optionLegs.forEach((shortLeg, _) => {
        // then loop through all the potential LONG put options inside, only combining the LONG puts that are strictly lower than the SHORT put options
        // if (!shortLeg.isOTM) {
        //     return
        // }
        optionLegs.forEach((longLeg, _) => {
            // if (!longLeg.isOTM) { //doesn't need to be OTM rn, but should be decently close
            //     return
            // }
            if ((type == "put" && longLeg.strike < shortLeg.strike) || (type == "call" && shortLeg.strike < longLeg.strike)) {
                const strategy = { shortLeg, longLeg, type };
                let templateEvalResult = strategy_evaluator_1.StrategyEvaluator.evaluateCreditSpread(strategy, maxCollateral); // we do this to easily get the max collateral
                if (templateEvalResult.collateral > maxCollateral) {
                    return;
                }
                const { totalMarkValue, totalNaturalValue } = gammaAdjustmentForTrueExpectedValue(strategy, currentStockPrice, IV, optionChain, maxCollateral, timeToExp);
                templateEvalResult.markExpectedVal = totalMarkValue;
                templateEvalResult.naturalExpectedVal = totalNaturalValue;
                allStratagies.push(templateEvalResult);
            }
        });
    });
    return getTopNaturalAndMark(allStratagies, limit);
}
function findBestIronCondor(limit, currentStockPrice, IV, optionChain, maxCollateral, timeToExp) {
    // try not to restrict or filter the options it gives you, because if it is resellient and thinks its timed right, it should be logical enough
    const { putOptions, callOptions } = optionChain;
    const putOptionArray = Object.values(putOptions);
    const callOptionArray = Object.values(callOptions);
    let allStratagies = [];
    putOptionArray.forEach((longPut, _) => {
        console.log(longPut.strike);
        if (!longPut.isOTM)
            return;
        putOptionArray.forEach((shortPut, _) => {
            if (shortPut.strike <= longPut.strike)
                return;
            if (!shortPut.isOTM)
                return;
            console.log(shortPut.strike);
            callOptionArray.forEach((shortCall, _) => {
                if (shortCall.strike <= shortPut.strike)
                    return;
                if (!shortCall.isOTM)
                    return;
                callOptionArray.forEach((longCall, _) => {
                    if (longCall.strike <= shortCall.strike)
                        return;
                    if (!longCall.isOTM)
                        return;
                    // The following could've been dispersed in parent loops, but I'm less worried about speed and more focused on code readability. 
                    // if (shortPut.strike > 157.5) return
                    // if (shortCall.strike < 170) return
                    // if (longPut.strike >= shortPut.strike) return
                    // if (shortCall.strike >= longCall.strike) return
                    const strategy = { longPut, shortPut, longCall, shortCall };
                    const { totalMarkValue, totalNaturalValue } = gammaAdjustmentForTrueExpectedValue(strategy, currentStockPrice, IV, optionChain, maxCollateral, timeToExp);
                    let templateEvalResult = strategy_evaluator_1.StrategyEvaluator.evaluateIronCondor(strategy, maxCollateral); // we do this to easily get the max collateral
                    templateEvalResult.markExpectedVal = totalMarkValue;
                    templateEvalResult.naturalExpectedVal = totalNaturalValue;
                    allStratagies.push(templateEvalResult);
                });
            });
        });
    });
    return getTopNaturalAndMark(allStratagies, limit);
}
function getTopNaturalAndMark(allStratagies, limit) {
    let topNaturalStrategies = [...allStratagies];
    let topMarkStrategies = [...allStratagies];
    topNaturalStrategies.sort((a, b) => {
        return b.naturalExpectedVal - a.naturalExpectedVal;
    });
    topMarkStrategies.sort((a, b) => {
        return b.markExpectedVal - a.markExpectedVal;
    });
    topNaturalStrategies = topNaturalStrategies.slice(0, limit);
    topMarkStrategies = topMarkStrategies.slice(0, limit);
    console.log("- - - NATURAL - - - ");
    topNaturalStrategies.forEach((strat, _) => console.log(strat));
    console.log("- - - MARK - - - ");
    topMarkStrategies.forEach((strat, _) => console.log(strat));
    return { topNaturalStrategies, topMarkStrategies };
}
// - - - MARK: Gamma Zone - - - 
/**
 * uses the target price to find a Euler approximation for the new probabilties (by using each gamma at each strike until you reach the center mean)
 *
 * @param {OptionLeg} option - The option to have its probabilties simulated when at the target price
 * @param {number} currentPrice - The current price of the stock (provides context to know how far we need to go to target price)
 * @param {{[key: number]: OptionLeg}} putOptions - All of the put options on the option chain (used for euler approximation of new probabilties)
 * @param {{[key: number]: OptionLeg}} callOptions - All of the call options on the option chain (used for euler approximation of new probabilties)
 * @returns { OptionLeg} The new Option Leg with the simulated probabilities
 */
function gammaSimulation(option, currentPrice, targetPrice, optionChan) {
    const { putOptions, callOptions } = optionChan;
    let strikes = []; // must sort bc unsorted won't return min distance between strikes
    Object.values(putOptions).forEach((optionLeg) => {
        strikes.push(optionLeg.strike);
    });
    strikes.sort((a, b) => {
        return a - b;
    });
    const strikeDistance = Math.abs(strikes[0] - strikes[1]); // widths can be different on the same chain
    const distanceToTarget = targetPrice - currentPrice; // directional to tell us which way to adjust
    const steps = Math.abs(distanceToTarget / strikeDistance);
    const intSteps = Math.floor(steps);
    const fractionalSteps = steps - intSteps;
    //use the current gamma first, and then once you get to the next strike use the next strike's gamma
    let newProfile = { ...option };
    let currentStrike = option.strike;
    let strikeMissingOcurrences = 0;
    for (let i = 0; i <= intSteps; i++) {
        const currentGamma = option.type == "put" ? putOptions[currentStrike].gamma * -1 : callOptions[currentStrike].gamma; //put options have negative delta and pos gamma, here we'll say pos delta negative gamma)
        if (i == intSteps) {
            newProfile.probITM = newProfile.probITM + currentGamma * fractionalSteps * strikeDistance * Math.sign(distanceToTarget);
        }
        else {
            newProfile.probITM = newProfile.probITM + currentGamma * strikeDistance * Math.sign(distanceToTarget);
        }
        //decide what the next strike is, and find the distance between current and next
        const movementDirection = Math.sign(distanceToTarget) * -1; //move the profile of the strike in the opposite direction as the price, because strikes have lower-strike like profiles as the price moves up & vice versa
        const nextIndex = strikes.indexOf(currentStrike) + movementDirection;
        if (strikes.length > nextIndex && nextIndex >= 0) {
            const nextStrike = strikes[nextIndex];
            currentStrike = nextStrike;
        }
        else {
            strikeMissingOcurrences += 1;
            //typically won't matter because when you get that far up/down the chain its just 99% / 1% anyways
            // #todo this might give more weight to certain outcomes than it should. Just try to click the more button before you send the data here. and make sure I know if i run out of strikes
            break;
        }
        if (strikeMissingOcurrences > 0)
            console.log({ strikeMissingOcurrences });
        // newProfile.gamma = option.type == "put" ? putOptions[currentStrike].gamma : callOptions[currentStrike].gamma //this was uncecessary
    }
    if (newProfile.probITM < 0)
        newProfile.probITM = 0;
    if (newProfile.probOTM < 0)
        newProfile.probOTM = 0;
    if (newProfile.probITM > 1)
        newProfile.probITM = 1;
    if (newProfile.probOTM > 1)
        newProfile.probOTM = 1;
    newProfile.probOTM = 1 - newProfile.probITM;
    return newProfile;
}
/**
 * probabiltiy that future stock price will be between two stock price
 
 * @param {number} time - how long for the stock to reach this price (in years, 1 month = 1/12)
 * @param {number} r - The risk-free interest rate
 * @returns {number} The cumulative probability from 0 to this stock price
 */
function stockPriceCDF(currentPrice, futurePrice1, futurePrice2, time, r, IV) {
    function normCDF(x) {
        return (1.0 + mathjs.erf(x / Math.sqrt(2))) / 2.0;
    }
    const S0 = currentPrice;
    const K_1 = futurePrice1;
    const K_2 = futurePrice2;
    const T = time;
    const sigma = IV;
    // Calculate d2
    const d2_1 = (Math.log(K_1 / S0) - (r - 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
    const d2_2 = (Math.log(K_2 / S0) - (r - 0.5 * Math.pow(sigma, 2)) * T) / (sigma * Math.sqrt(T));
    // Calculate the CDF value
    const cdfValue_1 = normCDF(d2_1);
    const cdfValue_2 = normCDF(d2_2);
    return Math.abs(cdfValue_1 - cdfValue_2);
}
// could've just used delta to approximate probOTM  and ITM, but wouldn't be as accurate
// could've just used an estimation between two strikes, but that wouldn't be as accurate. Also, different strikes have slightly different prob distributions, so probabilties could have major discrepencies
function gammaAdjustmentForTrueExpectedValue(strategy, currentStockPrice, IV, optionChain, maxCollateral, time) {
    let totalMarkValue = 0;
    let totalNaturalValue = 0;
    let lastResultValue = -99999999;
    [-1, 1].forEach(direction => {
        for (let i = 0; i < (100000); i++) {
            const width = .2;
            let newPrice = currentStockPrice + (width * i) * direction;
            let adjustedProfile = { ...strategy };
            Object.keys(strategy).forEach(key => {
                if (key == "type")
                    return; // only key on either that isn't an option leg
                const newLegProfile = gammaSimulation(adjustedProfile[key], currentStockPrice, newPrice, optionChain);
                adjustedProfile[key] = newLegProfile;
            });
            let evalResult = null;
            if (Object.keys(adjustedProfile).includes("type")) { //it is a credit spread
                evalResult = strategy_evaluator_1.StrategyEvaluator.evaluateCreditSpread(adjustedProfile, maxCollateral);
            }
            else {
                evalResult = strategy_evaluator_1.StrategyEvaluator.evaluateIronCondor(adjustedProfile, maxCollateral);
            }
            const probArea = stockPriceCDF(currentStockPrice, newPrice + direction * width, newPrice, time, RISK_FREE_RATE, IV);
            const expectedMarkValue = probArea * evalResult.markExpectedVal;
            const expectedNaturalValue = probArea * evalResult.naturalExpectedVal;
            // console.log({newPrice, expectedValue}, evalResult.markExpectedVal)
            totalMarkValue += expectedMarkValue;
            totalNaturalValue += expectedNaturalValue;
            // console.log({newPrice, expectedValue, probArea}, evalResult.markExpectedVal)
            if (lastResultValue == evalResult.markExpectedVal) {
                // console.log("- - -  expected reached max value - - - ")
                break;
            }
            lastResultValue = evalResult.markExpectedVal;
        }
        // console.log({totalValue: totalMarkValue})
    });
    return { totalMarkValue, totalNaturalValue };
}
// type ShortPut = Strategy & {
//     shortPut: OptionLeg
// }
const StrategyBuilder = { findBestCreditSpread, findBestIronCondor, gammaSimulation, gammaAdjustmentForTrueExpectedValue, stockPriceCDF };
exports.StrategyBuilder = StrategyBuilder;
