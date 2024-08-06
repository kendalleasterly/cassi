import assert from "assert"
import * as cheerio from "cheerio"
import * as fs from "fs"

function parseHTML(fileName: string) {
	// Read the HTML file

	const html = fs.readFileSync("HTML Files/" + fileName + ".html", "utf-8")

	// Load the HTML content into cheerio
	const $ = cheerio.load(html)

	// Extract and log the title

	return getOptions($)

}



function getTicker($: cheerio.CheerioAPI) {
    const ticker = $("h1.symbol").text()
    console.log(ticker)
}

function getOptions($: cheerio.CheerioAPI): OptionChain {

    const optionTables = $("div.chain-table-container__other-columns.native-scroll.in-app-scrollbar")

    let callOptions: {[key: number]: OptionLeg} = {}
    let putOptions: {[key: number]: OptionLeg} = {}

    optionTables.each((i, el) => {

        const tableEl = $(el)

        let isCalls: Boolean | undefined = undefined
        
        tableEl.find("thead").each((i, headEl) => {
            const optionType = String($(headEl).attr("data-rfd-droppable-id"))
            if (optionType == "option-chain-call") isCalls = true 
            if (optionType == "option-chain-put") isCalls = false
        })

        tableEl.find("tbody tr").each((i, rowEl) => { // for each option

            let currentOption: any = {
                type: isCalls ? "call" : "put"
            }

            const firstProperty = $(rowEl).find("div.value").get()[0]
            const ariaLabel = $(firstProperty).attr("aria-label") //We could extract all necessary info from the aria labels in each td, but it doesn't seem reliable

            const regex = /Strike (\d+.?\d),/
            const match = ariaLabel?.match(regex)![1]
            currentOption.strike = Number(match)

            const tdEl = $(rowEl).find("td").get()[0]
            const className = $(tdEl).attr("class")
            currentOption.isOTM = !className?.includes("otm")
            

            $(rowEl).find("td").each((i, tdEl) => { //for each attribute in each option
                
                //find the bid/ask: < button data-testid=${property}

                const button = $(tdEl).find("button").get()[0]

                
                if (button !== undefined) { //is either bid or ask

                    // will always be bid, then ask (either 0, 1 OR 4,5)

                    const value = $(button).text()
                    if (currentOption.bid == undefined) {
                        currentOption.bid = Number(value)
                    } else {
                        currentOption.ask = Number(value)
                    }


                } else {
                    //All others: <div<span data-testid=${property}

                    const spanEl = $(tdEl).find("div span").get()[0]
                    const property = $(spanEl).attr("data-testid")

                    const value = Number($(spanEl).text().replace("%", ""))

                    switch (property) {
                        case "GAMMA-cell-value":
                            currentOption.gamma = value
                            break;
                        case "PROBABILITY_ITM-cell-value":
                            currentOption.probITM = value / 100
                            break;
                        case "PROBABILITY_OTM-cell-value":
                            currentOption.probOTM = value / 100
                            break;
                        default:
                    }
                }
            })

            isCalls ? callOptions[currentOption.strike] = currentOption : putOptions[currentOption.strike] = currentOption
        })

        
        

        //div aria-label="strike number, type, property, value" NOt bid/ask
        // console.log({isCall}, tableEl.html())



        //extract all options from each table, into two arrays

    })

    return {callOptions, putOptions}

}

type OptionLeg = {
    bid: number ,
    ask: number,
    gamma: number
    probOTM: number,
    probITM: number,
    strike: number 
    isOTM: Boolean
    type: "call" | "put"
    
}

type OptionChain = {
    putOptions: {[key: number]: OptionLeg}
    callOptions: {[key: number]: OptionLeg}
}

const HTMLParser = { parseHTML, getTicker }

export { HTMLParser, OptionLeg, OptionChain}

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