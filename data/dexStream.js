const {ethers} = require("ethers");
const config = require("..//config");
const DEX = require("./dexBase");

class DexStream{

    defaultMessageFormat = (symbol, message, blockNumber = 0) => {
        return {
            'source': 'dex',
            'type': 'event',
            'block': blockNumber,
            'path': Array.from(message['path']),
            'pool_indexes': message['pool_indexes'],
            'symbol': symbol,
            'tag': message['tag'],
            'price': Array.from(message['price']),
            'fee': Array.from(message['fee']),
        };
    };

    constructor(dex, publisher = null, messageFormatter = this.defaultMessageFormat, debug = false) {
        this.dex = dex;
        this.publisher = publisher;
        this.messageFormatter = messageFormatter;
        this.debug = debug;



    }
    publish(data) {
        if (this.publisher) {
            this.publisher.put(data);
        }
    }


    streamV2Events = async  (chain) =>{
        const filteredPools = this.dex.pools.filter(pool => pool.chain === chain && pool.version === 2);
        const pools = Object.fromEntries(filteredPools.map(pool => [pool.address.toLowerCase(), pool]));

        const syncEventSelector = ethers.utils.id('Sync(uint112,uint112)');
        const wsproviderUrl = config.WS_ENDPOINTS.ethereum;
        const provider = new ethers.providers.WebSocketProvider(wsproviderUrl);



        const filter = {
            topics: [syncEventSelector]
        };

        provider.on(filter, async (log) =>{
            const address = log.address.toLowerCase();

            if (address in pools){
                const s = Date.now();
                const blockNumber = log.blockNumber;
                const pool = pools[address];
                const decodedData = ethers.utils.defaultAbiCoder.decode(['uint112', 'uint112'], log.data);

                await this.dex.updateReserves(pool.chain, pool.exchange, pool.token0, pool.token1, decodedData[0], decodedData[1]);


                const symbols = this.dex.getSymbolsToUpdate(pool.token0, pool.token1);
                console.log(symbols)
                for(let symbol of symbols){
                    await this.dex.updatePriceForSymbols(pool.chain, symbol);
                    this.publish(this.messageFormatter(symbol, this.dex.swapPaths[symbol], blockNumber));
                }





            }
        })


    }

}

let chain = 'ethereum';
let rpcEndpoints = {[chain]: config.RPC_ENDPOINTS[chain]};
let wsEndpoints = {[chain]: config.WS_ENDPOINTS[chain]};
let tokens = {[chain]: config.TOKENS[chain]};
let pools = config.POOLS.filter(pool => pool.chain === chain);
let tradingSymbols = ['ETH/USDT'];
let maxSwapNumber = 2;

let dex = new DEX({
    rpcEndpoints: rpcEndpoints,
    tokens: tokens,
    pools: pools,
    tradingSymbols: tradingSymbols,
    maxSwapNumber: maxSwapNumber
});

let dexstream = new DexStream(dex);
dexstream.streamV2Events(chain);
