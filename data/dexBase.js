const {ethers} = require("ethers");
const config = require("..//config");
const UniswapV2Simulator = require("..//simulation/uniswapV2Simulator").UniswapV2Simulator;
const UniswapV3Simulator = require("..//simulation/uniswapV3Simulator").UniswapV3Simulator;
const {Multicall} = require("ethereum-multicall");

// Dimension of DEX.storage_array
const CHAIN = 0;
const EXCHANGE = 1;
const TOKEN_IN = 2;
const TOKEN_OUT = 3;
const VERSION = 4;
const STORAGE = 5;

const V2 = 0;
const V3 = 1;

const DECIMALS0 = 0;
const DECIMALS1 = 1;
const RESERVE0 = 2;
const RESERVE1 = 3;
const SQRT_PRICE = 4;
const FEE = 5;
const TOKEN0_IN = 6;
const POOL_INDEX = 7;

class DexBase {

    constructor({rpcEndpoints, tokens, pools, tradingSymbols, maxSwapNumber}) {
        this.rpcEndpoints = rpcEndpoints;
        this.tokens = tokens;
        this.pools = pools;
        this.tradingSymbols = tradingSymbols;
        this.maxSwapNumber = maxSwapNumber;
        this.simV2 = new UniswapV2Simulator();
        this.simV3 = new UniswapV3Simulator();

        this.web3 = Object.fromEntries(
            Object.entries(this.rpcEndpoints).map(([k, v]) => {
                let provider = new ethers.providers.JsonRpcProvider(v);
                return [k, provider];
            })
        );



        // Erstellt ein Array mit allen chains als Inhalt. Dies wird unten bei der initialisierung der Dex gemacht.
        // console.log(this.chainsList) = ['ethereum']
        this.chainsList = Object.keys(tokens).sort();


        // Erstellt ein Array mit allen Exchanges.
        // console.log(this.exchangesList) = [ 'sushiswap', 'uniswap' ]
        this.exchangesList = Array.from(new Set(pools.map(p => p.exchange))).sort();

        // Erstellt ein Array mit allen Tokennamen
        // console.log(tokensList) = [ 'ETH', 'USDT', 'USDC', 'BTC', 'DAI', 'PEPE' ]
        var tokensList = [];
        for(let exchange in tokens){
            tokensList = tokensList.concat(Object.keys(tokens[exchange]))

        }

        // Erstellt eine tokensList in alphabetischer Reihenfolge und entfernt duplikate.
        // console.log(this.tokensList) = [ 'BTC', 'DAI', 'ETH', 'PEPE', 'USDC', 'USDT' ]
        this.tokensList = Array.from(new Set(tokensList)).sort();

        // Erstellt ein Objekt, das alle chains beinhaltet und diesen jeweils einen Index zuweist. Der Chain name ist der key um auf den Index zuzugreifen.
        // console.log(this.chain_to_id['ethereum']) = 0
        this.chainToId = Object.fromEntries(this.chainsList.map((k, i) => [k, i]));
        // Erstellt ein Objekt, das allen exchanges einen Index zuweist.
        this.exchangeToId = Object.fromEntries(this.exchangesList.map((k, i) => [k, i]));
        //Erstellt ein Objekt, das allen Token einen Index zuweist.
        this.tokenToId = Object.fromEntries(this.tokensList.map((k, i) => [k, i]));



        this.storageArray = new Array(this.chainsList.length).fill(0).map(() =>
            new Array(this.exchangesList.length).fill(0).map(() =>
                new Array(this.tokensList.length).fill(0).map(() =>
                    new Array(this.tokensList.length).fill(0).map(() =>
                        new Array(2).fill(0).map(() =>
                            new Array(8).fill(0)
                        )
                    )
                )
            )
        );

        this.storageIndex = Object.fromEntries(this.chainsList.map(c => [c, []]));
        this.swapPaths = Object.fromEntries(this.tradingSymbols.map(s => [s, null]));
    }

    async _loadPoolData() {
        /**
         * Lädt alle Speicherwerte von mehreren Pool-Verträgen mit Multicall
         * Dies ermöglicht es Benutzern, Daten auf der Blockchain in großen Mengen abzufragen
         */

        let callsByChain = {};
        this.chainsList.forEach(c => callsByChain[c] = []);
        for (let [poolIdx, pool] of this.pools.entries()) {

            let signature;
            let methodParameters = [];
            if (pool['version'] === 2) {
                signature = { name: 'getReserves', type: 'function', stateMutability: 'view', inputs: [], outputs: [ { name: '', type: 'uint112' }, { name: '', type: 'uint112' }, { name: '', type: 'uint32' }] };
            } else {
                signature = { name: 'slot0', type: 'function', stateMutability: 'view', inputs: [], outputs: [ { name: '', type: 'uint160' }, { name: '', type: 'int24' }, { name: '', type: 'uint16' }, { name: '', type: 'uint16' }, { name: '', type: 'uint16' }, { name: '', type: 'uint8' }, { name: '', type: 'bool' }] };
            }

            let call = {
                reference: `pool_${poolIdx}`,
                contractAddress: pool['address'],
                abi: [signature],
                calls: [{ reference: `call_${poolIdx}`, methodName: signature.name, methodParameters: methodParameters }]
            };
            callsByChain[pool['chain']].push(call);
        }




        let multicallResults = {};
        for (let chain in callsByChain) {
            let multicall = new Multicall({ ethersProvider: this.web3[chain], tryAggregate: true });
            multicallResults[chain] = await multicall.call(callsByChain[chain]);
        }

        for (let chain in multicallResults) {
            for (let poolKey in multicallResults[chain].results) {
                let poolIdx = parseInt(poolKey.replace('pool_', ''));


                let storageData = multicallResults[chain].results[poolKey].callsReturnContext[0].returnValues;
                let pool = this.pools[poolIdx];


                let chainIdx = this.chainToId[pool['chain']];
                let exchangeIdx = this.exchangeToId[pool['exchange']];
                let token0Idx = this.tokenToId[pool['token0']];
                let token1Idx = this.tokenToId[pool['token1']];
                let versionIdx;
                if(pool['version'] === 2){
                    versionIdx = V2;
                }else {
                    versionIdx = V3;
                }


                let idx1 = [chainIdx, exchangeIdx, token0Idx, token1Idx, versionIdx];
                let idx2 = [chainIdx, exchangeIdx, token1Idx, token0Idx, versionIdx];
                this.storageIndex[pool['chain']].push(idx1);
                this.storageIndex[pool['chain']].push(idx2);



                let decimals0 = this.tokens[pool['chain']][pool['token0']][1];
                let decimals1 = this.tokens[pool['chain']][pool['token1']][1];
                let fee = pool['fee'] / 10000.0 / 100.0;

                let data = Array(6).fill(0);

                if (versionIdx === V2) {
                    let reserve0 = storageData[0];
                    let reserve1 = storageData[1];

                    data = [decimals0, decimals1, reserve0, reserve1, 0, fee];
                } else if (versionIdx === V3) {
                    let sqrtPrice = storageData[0];
                    data = [decimals0, decimals1, 0, 0, sqrtPrice, fee];
                }
                for(let i = 0; i < data.length; i++){
                    this.storageArray[idx1[0]][idx1[1]][idx1[2]][idx1[3]][idx1[4]][i] = data[i];
                }
                for (let i = 0; i < data.length; i++) {
                    this.storageArray[idx2[0]][idx2[1]][idx2[2]][idx2[3]][idx2[4]][i] = data[i];
                }

                this.storageArray[idx1[0]][idx1[1]][idx1[2]][idx1[3]][idx1[4]][POOL_INDEX] = parseInt(poolIdx);
                this.storageArray[idx2[0]][idx2[1]][idx2[2]][idx2[3]][idx2[4]][POOL_INDEX] = parseInt(poolIdx);



            }
        }
    }
     _generateSwapPath(){
        let tokenInOut = {};
        for(let symbol of this.tradingSymbols){
            let tokens = symbol.split('/').reverse();
            tokenInOut[symbol] = tokens.map(token => this.tokenToId[token]);
        }


        let chainSwapPaths = {};
        for(let chain in this.storageIndex){

            let index = this.storageIndex[chain];

            let indexArr = index.map(i => i.slice());

            let symbolSwapPaths = {};

            for(let symbol in tokenInOut){
                let inOut = tokenInOut[symbol];


                let poolSamples = this.__samplePools(indexArr, inOut);



                let paths = this.__generatePaths(poolSamples);
                let pathsArr = paths.map(p => p.slice());
                if(pathsArr.length !== 0){
                    symbolSwapPaths[symbol] = pathsArr;
                }else {
                    symbolSwapPaths[symbol] = pathsArr;
                }
            }
            chainSwapPaths[chain] = symbolSwapPaths;



        }
         const getPoolIndexes = (symbolPaths) => {
             const indexes = [];
             for(let i = 0; i < symbolPaths.length; i++){
                 const idx = symbolPaths[i];

                 if(_arraySum(idx) !== 0){
                     const poolIdx = _getValueFromStorage(idx)[POOL_INDEX];

                     indexes.push(poolIdx)
                 }
             }
             return indexes;
         };
         function _arraySum(arr){
            return arr.reduce((acc, val) => acc + val, 0);
         }

         const _getValueFromStorage = (tuple) => {


             return this.storageArray[tuple[0]][tuple[1]][tuple[2]][tuple[3]][tuple[4]];
         }





         for(let symbol of this.tradingSymbols){
            const symbolPathsList = this.chainsList.map(chain => chainSwapPaths[chain][symbol]);
            const symbolPathsArray = [].concat(...symbolPathsList);
            const poolIndexes = symbolPathsArray.map(path => getPoolIndexes(path));
            const tokensInvolved = [... new Set(symbolPathsArray.flatMap(arr => arr.map(a => [a[TOKEN_IN], a[TOKEN_OUT]])))];
            const priceArr = new Array(symbolPathsArray.length).fill(0);
            const feeArr = new Array(symbolPathsArray.length).fill(0);

            const chainPathCounter = {};
            this.chainsList.forEach(chain => chainPathCounter[chain] = 0);
            const tags = symbolPathsArray.map(arr => {
                const chainIdx = arr[0][0];
                const chain = this.chainsList[chainIdx];
                const tag = `${chain}-${chainPathCounter[chain]}`;
                chainPathCounter[chain]++;
                return tag;
            });

            this.swapPaths[symbol] = {
                path: symbolPathsArray,
                poolIndexes: poolIndexes,
                tag: tags,
                tokens: tokensInvolved,
                price: priceArr,
                fee: feeArr
            };
        }
    }


    __samplePools(indexArr, inOut){
        const swapNums = Array.from({length: this.maxSwapNumber}, (_, i) => i + 1);
        const poolSamples = {};

        for(let n of swapNums){
            let[tokenIn, tokenOut] = inOut;
            let noPath = false;
            const filteredPools = Array(this.maxSwapNumber).fill([]);

            for(let i = 0; i < n; i++){
                let condition1;
                if(i === 0){
                    condition1 = indexArr.map(row => row[TOKEN_IN] === tokenIn);
                }else {
                    condition1 = indexArr.map(row => tokenIn.includes(row[TOKEN_IN]));
                }

                let condition2;
                if(i === n - 1){
                    condition2 = indexArr.map(row => row[TOKEN_OUT] === tokenOut);
                }else {
                    condition2 = indexArr.map(row => row[TOKEN_OUT] !== tokenOut);
                }

                const condition = condition1.map((val, idx) => val && condition2[idx]);
                const filtered = indexArr.filter((_, idx) => condition[idx]);

                if(filtered.length > 0){
                    filteredPools[i] = filtered;
                }else {
                    noPath = true;
                    break;
                }
                tokenIn = filtered.map(row => row[TOKEN_OUT]);
            }
            if(!noPath){
                poolSamples[n] = filteredPools;
            }
        }
        return poolSamples;
    }

    __generatePaths(poolSamples){
        function samplePathsList(n_TotalHops, NthHop, prevPool, sampled, poolSamples, paths) {
            for (const p of poolSamples[n_TotalHops][NthHop]) {
                sampled[NthHop] = p;
                if (prevPool === null || prevPool[TOKEN_OUT] === p[TOKEN_IN]) {
                    if (NthHop === n_TotalHops - 1) {
                        if (prevPool) {
                            const sameExchange = prevPool[EXCHANGE] === p[EXCHANGE];
                            const samerVersion = prevPool[VERSION] === p[VERSION];
                            const samePool = prevPool[TOKEN_IN] === p[TOKEN_OUT] && prevPool[TOKEN_OUT] === p[TOKEN_IN];

                            if (!(sameExchange && samerVersion && samePool)) {
                                paths.push([...sampled]);
                            }
                        } else {
                            paths.push([...sampled]);
                        }
                    } else {
                        samplePathsList(n_TotalHops, NthHop + 1, p, sampled, poolSamples, paths);
                    }
                }
            }
        }

        const paths = [];
        const emptyPool = [0, 0, 0, 0, 0];

        for(let i = 1; i <= this.maxSwapNumber; i++){
            if(poolSamples[i].length > 0){
                const sampled = Array(this.maxSwapNumber).fill(emptyPool);
                const prevPool = null;
                samplePathsList(i, 0, prevPool, sampled, poolSamples, paths);
            }
        }
        return paths;
    }



    load(){
        this._loadPoolData().then(() =>
        this._generateSwapPath());
    }

}



class Dex extends DexBase {




    constructor() {
        super({rpcEndpoints, tokens, pools, tradingSymbols, maxSwapNumber});
        this.load();
    }

    getIndex(chain, exchange, token0, token1, version) {
        const c = this.chainToId[chain];
        const e = this.exchangeToId[exchange];
        const t0 = this.tokenToId[token0];
        const t1 = this.tokenToId[token1];
        const v = version === 2 ? V2 : V3;
        return [c, e, t0, t1, v];


    }

    updateReserves(chain, exchange, token0, token1, reserve0, reserve1) {

        let idx1 = this.getIndex(chain, exchange, token0, token1, 2);
        let idx2 = [idx1[0], idx1[1], idx1[3], idx1[2], idx1[4]];

        this.storageArray[idx1[0]][idx1[1]][idx1[2]][idx1[3]][idx1[4]][RESERVE0] = reserve0;
        this.storageArray[idx1[0]][idx1[1]][idx1[2]][idx1[3]][idx1[4]][RESERVE1] = reserve1;

        this.storageArray[idx2[0]][idx2[1]][idx2[2]][idx2[3]][idx2[4]][RESERVE0] = reserve0;
        this.storageArray[idx2[0]][idx2[1]][idx2[2]][idx2[3]][idx2[4]][RESERVE1] = reserve1;

    }

    getSymbolsToUpdate(token0, token1) {
        let token0_id = this.tokenToId[token0];
        let token1_id = this.tokenToId[token1];
        let symbolsToUpdate = [];

        for (let symbol of this.tradingSymbols) {

            let tokensInvolved = this.swapPaths[symbol]['tokens'];
            let isTokenInvolved = tokensInvolved.some(innerArray => innerArray.includes(token0_id) || innerArray.includes(token1_id));
            if (isTokenInvolved) {
                symbolsToUpdate.push(symbol);
            }
        }

        return symbolsToUpdate;

    }

    updatePriceForSymbols(chain, symbol){
        if(!this.tradingSymbols.includes(symbol)){
            throw new Error(`${symbol} not in ${this.tradingSymbols}`);
        }

        const chainIdx = this.chainToId[chain];
        const pathsArr = this.swapPaths[symbol].path;

        for(let i = 0; i < pathsArr.length; i++){
            const path = pathsArr[i];

            if(path[0][0] === chainIdx){
                let price = 1.0;
                let fee = 1.0;

                for(let pStep = 0; pStep < path.length; pStep++){
                    const idx = path[pStep];
                    if(idx.reduce((a, b) => a + b, 0) === 0){
                        break;
                    }

                    const result = this.getPrice(...idx);
                    console.log("This is result:",result);
                    const [p, f] = result;
                    console.log("Value of p:", p);
                    console.log("Value of f:", f);
                    fee = fee * (1 - f);
                    price = price * (1 / p);
                    console.log("Value of price after calculation:",price)
                }
                this.swapPaths[symbol].price[i] = price;
                this.swapPaths[symbol].fee[i] = 1 - fee;
                console.dir(this.swapPaths, {depth: null});
            }
        }
    }

    getPrice(c, e, t0, t1, v) {
        const [dec0, dec1, res0, res1, sqrt, fee, tok0] = this.storageArray[c][e][t0][t1][v];
        console.log("This are the parameters in the getPrice function.",[dec0, dec1, res0, res1, sqrt, fee, tok0]);
        let t00 = ethers.BigNumber.from(t0);
        let decimalValue = t00.toString();
        console.log("Decimal value:", decimalValue);
        let price;
        if (v === V2) {
            price = this.simV2.reservesToPrice(res0, res1, dec0, dec1, Boolean(tok0));
        } else {
            price = this.simV3.sqrtx96ToPrice(sqrt, dec0, dec1, Boolean(tok0));
        }
        console.log("This is the Price from the getPrice function", price)

        return [price, fee];
    }




}

module.exports = Dex;

let chain = 'ethereum';
let rpcEndpoints = {[chain]: config.RPC_ENDPOINTS[chain]};
let tokens = {[chain]: config.TOKENS[chain]};
let pools = config.POOLS.filter(pool => pool.chain === chain);
let tradingSymbols = ['ETH/USDT'];
let maxSwapNumber = 2;







