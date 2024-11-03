import {Client} from "@notionhq/client"
import { PageObjectResponse, PartialDatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import "dotenv/config"
import { EvalResult } from "./strategy-evaluator"
import { OptionLeg } from "./html-parser"
import { CreditSpread, IronCondor } from "./strategy-builder"

const notionSecret = process.env.NOTION_SECRET
const notion = new Client({auth: notionSecret})

const DATABASE_ID = "f058ca69-f082-47d6-9538-59a9afa37f04"

const STRATEGY_TYPES_IDS = {
    "Iron Condor": "<;oO",
    "Call Credit Spread": "hRZ\\",
    "Put Credit Spread": "Cmel"
}

class NotionModel {
    constructor(
        public ticker: string,
        public expDate: Date,
        public batchTime: string,
        public SMA: number,
        public meanVolatility: number
    ) {}


    async pushResult(result: EvalResult) {

        const {strategyID, formattedStrikes, strategyTypeID, strategyTitle} = this.getStrategyInfo(result.strategy)

        await notion.pages.create({
            parent: {
                database_id: DATABASE_ID,
            },
            properties: {
                Title: {
                    title: richText(strategyTitle)
                },
                ID: {
                    rich_text: richText(strategyID),
                },
                ...formattedStrikes,
                "Strategy Type": {
                    select: {
                        id: strategyTypeID
                    }
                },
                "Expiration Date": {
                    date: {
                        start: this.expDate.toISOString(),
                    },
                },
               "Batch Time": {
                    rich_text: richText(this.batchTime)
                },
                "SMA": {
                    number: this.SMA
                },
                "Volatility": {
                    number: this.meanVolatility
                },
                ...this.getPropertiesFrom(result)
            }
        })
    }

    getPropertiesFrom(result: EvalResult) {

        let breakevens: {[key: string]: {number: number}} = {}

        const putBreakeven = result.natural.breakEvens.put
        const callBreakeven = result.natural.breakEvens.call
        if (putBreakeven) breakevens["Put Breakeven"] = {number: putBreakeven}
        if (callBreakeven) breakevens["Call Breakeven"] = {number: callBreakeven}

        return {
            Collateral: {
                number: result.collateral
            },
            "Mark E(x)": {
                number: result.mark.expectedValue
            },
            "Natural E(x)": {
                number: result.natural.expectedValue
            },
            "Mark Price": {
                number: result.mark.price
            },
            "Natural Price": {
                number: result.natural.price
            },
            "Mark Max Loss": {
                number: result.mark.maxLoss
            },
            "Natural Max Loss": {
                number: result.natural.maxLoss
            },
            ...breakevens
        }
    }
    

    getLegID(leg: OptionLeg) {

        const day = this.expDate.getDate()
        const month = this.expDate.getMonth()
        const year = this.expDate.getFullYear() - 2000
        const dateComponent = `${addLeadingZero(year)}${addLeadingZero(month)}${addLeadingZero(day)}`

        let strikeComponent = new String(leg.strike * 1000) // Requires the strike component to be of length 8
        strikeComponent = "0".repeat(8 - strikeComponent.length) + strikeComponent


        return `${this.ticker}${dateComponent}${leg.type == "call" ? "C" : "P"}${strikeComponent}`

        function addLeadingZero(component: number) {
            return component < 10 ? `0${component}` : `${component}`
        }
    }

    getStrategyInfo(strategy: IronCondor | CreditSpread): {strategyID: string, formattedStrikes: {[key: string]: {number: number}}, strategyTypeID: string, strategyTitle: string} {

        let strategyID = ""
        let strikes: {[key: string]: number} = {}
        let strategyTypeID = ""
        let strategyTitle = ""

        if (strategy.strategyType == "credit spread")  {
            const creditSpread = strategy as CreditSpread
            if (creditSpread.type == "put") {

                strategyID = this.getLegID(creditSpread.longLeg) + "," + this.getLegID(creditSpread.shortLeg)

                strikes["Long Put Strike"] = creditSpread.longLeg.strike
                strikes["Short Put Strike"] = creditSpread.shortLeg.strike

                strategyTypeID =  STRATEGY_TYPES_IDS["Put Credit Spread"]

                strategyTitle = `${this.ticker} $${creditSpread.longLeg.strike} / $${creditSpread.shortLeg.strike} Puts`

            } else {
                strategyID = this.getLegID(creditSpread.shortLeg) + "," + this.getLegID(creditSpread.longLeg)

                strikes["Short Call Strike"] = creditSpread.shortLeg.strike
                strikes["Long Call Strike"] = creditSpread.longLeg.strike

                strategyTypeID = STRATEGY_TYPES_IDS["Call Credit Spread"] 

                strategyTitle = `${this.ticker} $${creditSpread.shortLeg.strike} / $${creditSpread.longLeg.strike} Calls`
            }
        } else {
            const ironCondor = strategy as IronCondor
            strategyID = this.getLegID(ironCondor.longPut) + "," + this.getLegID(ironCondor.shortPut) + "," + this.getLegID(ironCondor.shortCall) + "," + this.getLegID(ironCondor.longCall)

            strikes["Long Put Strike"] = ironCondor.longPut.strike
            strikes["Short Put Strike"] = ironCondor.shortPut.strike
            strikes["Short Call Strike"] = ironCondor.shortCall.strike
            strikes["Long Call Strike"] = ironCondor.longCall.strike

            strategyTypeID = STRATEGY_TYPES_IDS["Iron Condor"] 

            strategyTitle = `${this.ticker} ${ironCondor.shortPut.strike} - ${ironCondor.shortCall.strike}`
        }

        let formattedStrikes: {[key: string]: {number: number}} = {}

        Object.keys(strikes).forEach(key => {
            formattedStrikes[key] = {number: strikes[key]}
        })

        

        return {strategyID, formattedStrikes, strategyTypeID, strategyTitle}
    }

    async updateResult(result: EvalResult, pageID: string) {
        const response = await notion.pages.update({
            page_id: pageID,
            properties: {
                ...this.getPropertiesFrom(result),
                "Batch Time": {
                    rich_text: richText(this.batchTime)
                }
            }
        })
    }

    async findExistingStrategy(id: string): Promise<string | undefined> {
        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                property: "ID",
                rich_text: {
                    equals: id
                }
            }
        })

        if (response.results.length > 0) return response.results[0].id
        
    }

    async updateOrPushResult(result: EvalResult) {
        
        // Find if this result already has a page
        // Get what the ID would be
        const { strategyID } = this.getStrategyInfo(result.strategy)

        const existingPage = await this.findExistingStrategy(strategyID)

        if (existingPage) {
            await this.updateResult(result, existingPage)
        } else {
            await this.pushResult(result)
        }
    }

    async getOpenPositions(): Promise<({strategy: IronCondor | CreditSpread, pageID: string, currentQuantity: number})[]> {
        // filter for strategies that have execution price

        const response = await notion.databases.query({
            database_id: DATABASE_ID,
            filter: {
                and: [
                    {
                        property: "Execution Price",
                        number: {
                            is_not_empty: true
                        }
                    },
                    {
                        property: "ID",
                        rich_text: {
                            contains: this.ticker
                        }
                    },
                    {
                        property: "Close Price",
                        number: {
                            is_empty: true
                        }
                    }
                ]
            }
        })

        let results:({strategy: IronCondor | CreditSpread, pageID: string, currentQuantity: number})[] = []

        response.results.forEach((result) => {

            // iron condor or credit spread?
            const properties = (result as any).properties

            const creditRecieved = properties["Execution Price"].number as number
            const currentQuantity = properties["Execution Quantity"].number as number
            const type = properties["Strategy Type"]["select"]["name"] as string

            // reconstruct it into the strategy

            if (type.includes("Credit Spread")) {

                const isCall = type.includes("Call")
                const longStrike = properties[`Long ${isCall ? "Call" : "Put"} Strike`].number as number
                const shortStrike = properties[`Short ${isCall ? "Call" : "Put"} Strike`].number as number

                const creditSpread: CreditSpread = {
                    shortLeg: {
                        strike: shortStrike, type: "call", bid: creditRecieved, ask: creditRecieved
                    }, 
                    longLeg: {
                        strike: longStrike, type: "call", bid: 0, ask: 0
                    },
                    type: isCall ? "call" : "put",
                    strategyType: "credit spread"
                }

                results.push({strategy: creditSpread, pageID: result.id, currentQuantity})

            } else if (type == "Iron Condor") {

                const longPutStrike = properties[`Long Put Strike`].number as number
                const shortPutStrike = properties[`Short Put Strike`].number as number
                const shortCallStrike = properties[`Short Call Strike`].number as number
                const longCallStrike = properties[`Long Call Strike`].number as number
                

                const ironCondor: IronCondor = {
                    longPut: {
                        strike: longPutStrike, bid: 0, ask: 0, type: "put"
                    },
                    shortPut: {
                        strike: shortPutStrike, bid: creditRecieved / 2, ask: creditRecieved / 2, type: "put"
                    },
                    shortCall: {
                        strike: shortCallStrike, bid: creditRecieved / 2, ask: creditRecieved / 2, type: "call"
                    },
                    longCall: {
                        strike: longCallStrike, bid: 0, ask: 0, type: "call"
                    },
                    strategyType: "iron condor"
                }

                results.push({strategy: ironCondor, pageID: result.id, currentQuantity})
            }
        })

        return results
    }

    async updateCurrentExpectedValue(pageID: string, currentEx: number) {
        await notion.pages.update({
            page_id: pageID,
            properties: {
                "Current E(X)": {
                    number: currentEx
                }
            }
        })
    }

    // - - - MARK: Test Zone - - - 

    async testFunction() {
        const response = await notion.search({
            query: "Strategies",
            filter: {
                value: "database",
                property: "object"
            }
        })

        console.log(((response.results[0] as PartialDatabaseObjectResponse).properties["Strategy Type"] as any) ["select"])
    }
    
}

// - - - MARK: Helper Functions - - - 

function richText(text: string) {
	return [
		{
			text: {
				content: text,
			},
		},
	]
}


let systemSettings: {
	sortingMethod: "Top_Mark_of_Top_Natural" | "Top_Breakevens" | "Top_Natural"
} = {
	sortingMethod: "Top_Mark_of_Top_Natural",
}


export { NotionModel, systemSettings }