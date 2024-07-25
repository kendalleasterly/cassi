import { OptionLeg } from "./html-parser"

type Strategy = {
    ticker: string
}
 
type CreditSpread = Strategy & {
    shortLeg: OptionLeg
    longLeg: OptionLeg
    type: "put" | "call"
}

type IronCondor = Strategy & {
    longPut: OptionLeg
    shortPut: OptionLeg
    shortCall: OptionLeg
    longCall: OptionLeg
}

type ShortPut = Strategy & {
    shortPut: OptionLeg
}

export {CreditSpread, IronCondor, ShortPut}