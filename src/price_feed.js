import axios from 'axios';
import { WebsocketStream } from '@binance/connector';
import {Console} from 'console';
import BigNumber from "bignumber.js";

const logger = new Console({ stdout: process.stdout, stderr: process.stderr })

// define callbacks for different events
const callbacks = {
  open: () => logger.debug('Connected with Websocket server'),
  close: () => logger.debug('Disconnected with Websocket server'),
  message: data => {
    let parsed = JSON.parse(data);
    crypto[parsed.s].price = (parseFloat(parsed.b) + parseFloat(parsed.a))/2;
    crypto[parsed.s].timestamp = Date.now();
  }
}

// Binance websocket client
const websocketStreamClient = new WebsocketStream({ logger, callbacks })

//Avalanche contract addresses:
const sAVAXAddress = '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be';
const AVAXAddress = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';
const WETHeAddress = '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB';
const USDCAddress = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';

let forex = {
    "EURUSD":{price:0,timestamp:0},
}
let crypto = {
    "AVAXUSDT":{price:0,timestamp:0},
    "ETHUSDT":{price:0,timestamp:0},
    "USDCUSDT":{price:0,timestamp:0},
    "BTCUSDT":{price:0,timestamp:0},
}

// Prices to be served
let prices = {
    "EUROC-USD":0,
    "AVAX-USD":0,
    "USDC-USD":0,
    "USDt-USD":0,
    "WETH.e-USD":0,
    "BTC.b-USD":0,
    "sAVAX-AVAX":0,
};

for (let ticker in crypto){
    websocketStreamClient.bookTicker(ticker);
}

// Updates all prices every interval. Right now this function gets pricing data from Binance, Kraken, and eodhistoricaldata. You can add your own price calculation logic here.
export default async function startPriceFeed (app) {

    setInterval(async ()=>{
        try {
            let response = await axios.get("https://eodhistoricaldata.com/api/real-time/EURUSD.FOREX?api_token=demo&fmt=json"); //Only EUR/USD is free using "demo" key. Maybe won't be free forever. It's not too expensive to sign up
            forex["EURUSD"].price = response.data.close;
        } catch(error) {
            console.log('failed to get eurusd price', error);
        }
        
        let usdcPrice = 0;
        let usdtPrice = 0;
        try {
            let usdcResult = await axios.get("https://api.kraken.com/0/public/Ticker?pair=USDCUSD");
            usdcPrice = (parseFloat(usdcResult.data.result.USDCUSD.a[0]) + parseFloat(usdcResult.data.result.USDCUSD.b[0]))/2;
            prices["USDC-USD"] = usdcPrice;
            let usdtResult = await axios.get("https://api.kraken.com/0/public/Ticker?pair=USDTUSD");
            usdtPrice = (parseFloat(usdtResult.data.result.USDTZUSD.a[0]) + parseFloat(usdtResult.data.result.USDTZUSD.b[0]))/2;
            prices["USDt-USD"] = usdtPrice;
        } catch (error){
            console.log("unable to get usdc price from Kraken:",error);
        }

        prices["AVAX-USD"] = crypto["AVAXUSDT"].price * prices["USDt-USD"];
        //prices["WETH.e-USD"] = crypto["ETHUSDT"].price * prices["USDt-USD"]; // use this if you want to use the binance price for eth/usdc. Also comment out the Paraswap WETH.e-USD code below.
        prices["BTC.b-USD"] = crypto["BTCUSDT"].price * prices["USDt-USD"];
        prices["EUROC-USD"] = forex["EURUSD"].price;

        let date = new Date();
        console.log("timestamp:", date.toDateString());
        console.log("PRICES:",prices);
    }, 3000);

    // Gets sAVAX-AVAX and WETH.e-USD prices from paraswap. Paraswap has very low rate limits, hence the 10 seconds interval. Someone should go bug them about that.
    setInterval(async ()=>{
        try {
            prices["sAVAX-AVAX"] = await getParaswapPrice(sAVAXAddress,AVAXAddress,1000,18,18);
            
            let wetheusdc = await getParaswapPrice(WETHeAddress,USDCAddress,50,18,6);
            prices["WETH.e-USD"] = wetheusdc * prices["USDC-USD"]; // save weth usd price
        } catch (err) {
            console.log("error getting paraswap prices:", err);
        }
    },10000)

    app.get('/prices', (req, res) => {
        res.send(prices);
    });

}

// Gets the paraswap bid and ask quotes for given depths and averages them for the pair price. The decimals can be tricky.
async function getParaswapPrice(srcAddress,destAddress, depth,srcDecimals,destDecimals) {

try {
    const bidPriceData = await axios.get('https://apiv5.paraswap.io/prices?srcToken='+srcAddress+'&srcDecimals='+srcDecimals+'&destToken='+destAddress+'&destDecimals='+destDecimals+'&amount=' + depth.toString() + getZeros(srcDecimals)+ '&side=SELL&network=43114')
    const srcAmountBid = new BigNumber(bidPriceData.data.priceRoute.srcAmount);
    const destAmountBid = new BigNumber(bidPriceData.data.priceRoute.destAmount);
    let bidPrice = parseFloat(destAmountBid.div(srcAmountBid).times('1'+getZeros(srcDecimals-destDecimals)));

    const askPriceData = await axios.get('https://apiv5.paraswap.io/prices?srcToken='+destAddress+'&srcDecimals='+destDecimals+'&destToken='+srcAddress+'&destDecimals='+srcDecimals+'&amount=' + depth.toString() + getZeros(destDecimals) +'&side=SELL&network=43114')
    const srcAmountAsk = new BigNumber(askPriceData.data.priceRoute.srcAmount);
    const destAmountAsk = new BigNumber(askPriceData.data.priceRoute.destAmount);
    let askPrice = parseFloat(srcAmountAsk.div(destAmountAsk).times('1'+getZeros(srcDecimals-destDecimals)));

    return (bidPrice+askPrice)/2;
} catch (error) {
    console.log("error getting SavaxSellPrice:", error);
}
}

// To help with the decimals from Paraswap pricing
function getZeros(decimals) {
    let zeros = ''
    for (let i = 0; i < decimals; i++){
        zeros += '0'
    }
    return zeros;
  }