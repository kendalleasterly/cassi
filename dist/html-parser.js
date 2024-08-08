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
exports.HTMLParser = void 0;
const cheerio = __importStar(require("cheerio"));
const fs = __importStar(require("fs"));
function parseHTML(fileName) {
    // Read the HTML file
    const html = fs.readFileSync("HTML Files/" + fileName + ".html", "utf-8");
    // Load the HTML content into cheerio
    const $ = cheerio.load(html);
    // Extract and log the title
    return getOptions($);
}
function getTicker($) {
    const ticker = $("h1.symbol").text();
    console.log(ticker);
}
function getOptions($) {
    const optionTables = $("div.chain-table-container__other-columns.native-scroll.in-app-scrollbar");
    let callOptions = {};
    let putOptions = {};
    optionTables.each((i, el) => {
        const tableEl = $(el);
        let isCalls = undefined;
        tableEl.find("thead").each((i, headEl) => {
            const optionType = String($(headEl).attr("data-rfd-droppable-id"));
            if (optionType == "option-chain-call")
                isCalls = true;
            if (optionType == "option-chain-put")
                isCalls = false;
        });
        tableEl.find("tbody tr").each((i, rowEl) => {
            let currentOption = {
                type: isCalls ? "call" : "put"
            };
            const firstProperty = $(rowEl).find("div.value").get()[0];
            const ariaLabel = $(firstProperty).attr("aria-label"); //We could extract all necessary info from the aria labels in each td, but it doesn't seem reliable
            const regex = /Strike (\d+.?\d),/;
            const match = ariaLabel?.match(regex)[1];
            currentOption.strike = Number(match);
            const tdEl = $(rowEl).find("td").get()[0];
            const className = $(tdEl).attr("class");
            currentOption.isOTM = !className?.includes("otm");
            $(rowEl).find("td").each((i, tdEl) => {
                //find the bid/ask: < button data-testid=${property}
                const button = $(tdEl).find("button").get()[0];
                if (button !== undefined) { //is either bid or ask
                    // will always be bid, then ask (either 0, 1 OR 4,5)
                    const value = $(button).text();
                    if (currentOption.bid == undefined) {
                        currentOption.bid = Number(value);
                    }
                    else {
                        currentOption.ask = Number(value);
                    }
                }
                else {
                    //All others: <div<span data-testid=${property}
                    const spanEl = $(tdEl).find("div span").get()[0];
                    const property = $(spanEl).attr("data-testid");
                    const value = Number($(spanEl).text().replace("%", ""));
                    switch (property) {
                        case "GAMMA-cell-value":
                            currentOption.gamma = value;
                            break;
                        case "PROBABILITY_ITM-cell-value":
                            currentOption.probITM = value / 100;
                            break;
                        case "PROBABILITY_OTM-cell-value":
                            currentOption.probOTM = value / 100;
                            break;
                        default:
                    }
                }
            });
            isCalls ? callOptions[currentOption.strike] = currentOption : putOptions[currentOption.strike] = currentOption;
        });
        //div aria-label="strike number, type, property, value" NOt bid/ask
        // console.log({isCall}, tableEl.html())
        //extract all options from each table, into two arrays
    });
    return { callOptions, putOptions };
}
const HTMLParser = { parseHTML, getTicker };
exports.HTMLParser = HTMLParser;
// - - - Not needed - - - 
// function getStrikes($: cheerio.CheerioAPI) {
//     let strikes: number[] = []
// 	const strikeRows = $("table.chain-table.chain-table__strike tbody tr") //
// 	strikeRows.each((i, el) => {
//         const strike = Number($(el).text())
//         if (!Number.isNaN(strike)) {
//             strikes.push(Number(strike))
//         }
// 	})
//     return strikes
// }
