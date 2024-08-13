import axios, { AxiosResponse } from "axios"
import "dotenv/config"
import * as mathjs from 'mathjs';

const TWELVE_DATA_KEY = process.env.TWELVE_DATA_KEY

const BASE_URL = "https://api.twelvedata.com"

class TwelveDataModel {

    constructor(
        public symbol: string,
        public interval: TimeInterval,
        public length: number,
    ) {}

    async getStdDevs(): Promise<{[key: string]: number[]}>  {

        let stdDevDict: {[key: string]: number[]} = {}

        let promises: Promise<AxiosResponse<any, any>>[] = [];

        ["open", "close", "high", "low"].forEach(series_type => {
            const result = axios.get(BASE_URL + "/stddev", {
                params: {
                    symbol: this.symbol, interval: this.interval, sd: 1, series_type, outputsize: this.length, apikey: TWELVE_DATA_KEY
                }
            })

            promises.push(result)
        })

        const results = await Promise.all(promises)

        results.forEach(result => {
            (result.data.values as [{datetime: string, stddev: string}]).forEach((value) => {
                if (Object.keys(stdDevDict).includes(value.datetime)) {
                    stdDevDict[value.datetime].push(Number(value.stddev)) 
                } else {
                    stdDevDict[value.datetime] = [Number(value.stddev)]
                }
            })
        })

        return stdDevDict
        
    }

    async getAvgPrices(interval: TimeInterval = this.interval, outputsize: number = this.length): Promise<{[key: string]: number}> {

        let avgPrices: {[key: string]: number} = {}

        const result = await axios.get(BASE_URL + "/avgprice", {
            params: {
                symbol: this.symbol, interval, outputsize, apikey: TWELVE_DATA_KEY
            }
        })

        result.data.values.forEach((value: {datetime: string, avgprice: string}) => {
            avgPrices[value.datetime] = Number(value.avgprice)
        })

        return avgPrices
        

    }

    async getVolatilityLogDistribution(): Promise<{mean: number, stdDev: number}> {

        const avgPrices = await this.getAvgPrices()
        const stdDevs = await this.getStdDevs()

        let volatilities: number[] = []

        // convert all of the raw standard deviations to their anualized volatility using the average price from that period
        Object.keys(avgPrices).forEach(dateTime => {

            const price = avgPrices[dateTime]
            
            stdDevs[dateTime].forEach(stdDev => {
                //convert to annualized volatility

                const timeFactor = 12 // 12 five-minute periods in an hour

                const volatility = stdDev * (1 / price) * Math.sqrt(6.5 * 252 * timeFactor) // 6.5 hours in a trading day, 252 trading days in a year

                volatilities.push(volatility)

            })

        })

        let logVolatilities: number[] = []

        volatilities.forEach(volatilitiy => {
            logVolatilities.push(Math.log(volatilitiy)) 
        })

        return this.getMeanAndStdDev(logVolatilities)

    }

    // - - - Helper Functions - - -

    getMeanAndStdDev(data: number[]): {mean: number, stdDev: number} {

        let mean = 0
        let stdDev = 0

        mean = mathjs.mean(data)

        stdDev = mathjs.std(data) as unknown as number

        return {mean, stdDev}

    }

   
}

type TimeInterval = "1min" | "5min" | "15min" | "30min" | "45min" | "1h" | "2h" | "4h" | "1day" | "1week" | "1month" 
export {TwelveDataModel}