require("dotenv").config();
const ethereum = require("./addresses/ethereum").ethereum;

const RPC_ENDPOINTS = {
    "ethereum": process.env.RPC_URL_ETHEREUM,
    "polygon": process.env.RPC_URL_POLYGON,
};

const WS_ENDPOINTS = {
    "ethereum": process.env.WS_ETHEREUM,
};

const TOKENS = {
    "ethereum": ethereum.TOKENS,
};

const POOLS = ethereum.POOLS;

const SIMULATION_HANDLERS = {
    "ethereum": ethereum.SIMULATION_HANDLERS,
};

const EXECUTION_HANDLERS = {
    "ethereum": ethereum.EXECUTION_HANDLERS
};

module.exports = {
    RPC_ENDPOINTS: RPC_ENDPOINTS,
    WS_ENDPOINTS: WS_ENDPOINTS,
    TOKENS: TOKENS,
    POOLS: POOLS,
    SIMULATION_HANDLERS: SIMULATION_HANDLERS,
    EXECUTION_HANDLERS: EXECUTION_HANDLERS,
}
