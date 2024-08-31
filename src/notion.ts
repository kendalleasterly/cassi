import {Client} from "@notionhq/client"
import { PartialDatabaseObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import "dotenv/config"
import { EvalResult } from "./strategy-evaluator"
import { OptionLeg } from "./html-parser"
import { CreditSpread, IronCondor } from "./strategy-builder"

const notionSecret = process.env.NOTION_SECRET
const notion = new Client({auth: notionSecret})

const DATABASE_ID = "f058ca69-f082-47d6-9538-59a9afa37f04"

class NotionModel {
    constructor(
        public ticker: string,
        public expDate: Date
    ) {}


    async pushResult(result: EvalResult) {

        const {strategyID, formattedStrikes, strategyTypeID} = this.getStrategyInfo(result.strategy)

        const response = await notion.pages.create({
            parent: {
                database_id: DATABASE_ID,
            },
            properties: {
                ID: {
                    title: richText(strategyID),
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
                ...this.getPropertiesFrom(result)
            }
        })

        console.log(response)
    }

    getPropertiesFrom(result: EvalResult) {
        return {
            Quantity: {
                number: result.quantity
            },
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
            }
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

    getStrategyInfo(strategy: IronCondor | CreditSpread): {strategyID: string, formattedStrikes: {[key: string]: {number: number}}, strategyTypeID: string} {
        let strategyID = ""
        let strikes: {[key: string]: number} = {}
        let strategyTypeID = ""

        if (Object.keys(strategy).includes("type"))  { //it's a credit spread
            const creditSpread = strategy as CreditSpread
            if (creditSpread.type == "put") {

                strategyID = this.getLegID(creditSpread.longLeg) + "," + this.getLegID(creditSpread.shortLeg)

                strikes["Long Put Strike"] = creditSpread.longLeg.strike
                strikes["Short Put Strike"] = creditSpread.shortLeg.strike

                strategyTypeID = "Cmel" // Put Credit Spread Type ID in Notion

            } else {
                strategyID = this.getLegID(creditSpread.shortLeg) + "," + this.getLegID(creditSpread.longLeg)

                strikes["Short Call Strike"] = creditSpread.shortLeg.strike
                strikes["Long Call Strike"] = creditSpread.longLeg.strike

                strategyTypeID = "hRZ\\" // Call Credit Spread Type ID in Notion
            }
        } else {
            const ironCondor = strategy as IronCondor
            strategyID = this.getLegID(ironCondor.longPut) + "," + this.getLegID(ironCondor.shortPut) + "," + this.getLegID(ironCondor.shortCall) + "," + this.getLegID(ironCondor.longCall)

            strikes["Long Put Strike"] = ironCondor.longPut.strike
            strikes["Short Put Strike"] = ironCondor.shortPut.strike
            strikes["Short Call Strike"] = ironCondor.shortCall.strike
            strikes["Long Call Strike"] = ironCondor.longCall.strike

            strategyTypeID = "<;oO" // Iron Condor Type ID in Notion
        }

        let formattedStrikes: {[key: string]: {number: number}} = {}

        Object.keys(strikes).forEach(key => {
            formattedStrikes[key] = {number: strikes[key]}
        })

        return {strategyID, formattedStrikes, strategyTypeID}
    }

    async updateResult(result: EvalResult, pageID: string) {
        const response = await notion.pages.update({
            page_id: pageID,
            properties: this.getPropertiesFrom(result)
        })

        console.log(response)
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


export { NotionModel }






// - - - MARK: Old Functions - - - 
// async testFunction() {
//     const response = await notion.search({
//         query: "Strategies",
//         filter: {
//             value: "database",
//             property: "object"
//         }
//     })

//     console.log(response)
// }