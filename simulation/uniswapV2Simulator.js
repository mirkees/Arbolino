const {ethers} = require("ethers");

class UniswapV2Simulator {


    /*Diese Methode berechnet den Preis eines Tokens in Bezug auf den anderen in UniswapV2, basierend auf ihren Reserven in
    * einem Uniswap-Pool. Die Reserven sind die Mengen der beiden Tokens, die in dem Pool gespeichert sind. Die
    * Methode nimmt die Reserven der beiden Tokens, ihre Dezimalstellen und eine Boolesche Variable, die angibt,
    * ob Token0 eingezahlt wird, als Eingabe und gibt den Preis zurück. Preis impact und fees werden hier nicht berücksichtigt. */

    reservesToPrice(reserve0, reserve1, decimals0, decimals1, token0in) {
        const res0Value = parseFloat(reserve0.toString());
        const res1Value = parseFloat(reserve1.toString());
        const price = res1Value / res0Value * Math.pow(10, (decimals0 - decimals1));
        return token0in ? price : 1 / price;
    }

    /*Diese Methode berechnet die Menge an Tokens, die ich erhalten würde, wenn ich eine bestimmte Menge ( amount_in )
    * eines anderen Tokens in den Uniswap Pool einzahle. Diese Methode berücksichtig die Gebühren und den Preisimpact.*/
    getAmountOut(amount_in, reserve_in, reserve_out, fee = 3000) {
        fee = Math.floor(fee / 1000); // Standardmäßig beträgt die Gebühr 3000, was 0,3% entspricht, da die Gebühr in Tausendstel angegeben wird
        let amount_in_with_fee = amount_in * (1000 - fee);
        let numerator = amount_in_with_fee * reserve_out;
        let denominator = (reserve_in * 1000) + amount_in_with_fee;
        return Math.floor(numerator / denominator);
    }

    /*Diese Methode berechnet die Menge an Tokens, die ich in den Uniswap pool einzahlen muss, um eine bestimmte Menge
    * ( amount_out ) eines anderen Tokens zu erhalten. Diese Methode berücksichtig die Gebühren und den Preisimpact.*/
    getAmountIn(amount_out, reserve_in, reserve_out, fee = 3000) {
        fee = fee / 1000; // Standardmäßig beträgt die Gebühr 3000, was 0,3% entspricht, da die Gebühr in Tausendstel angegeben wird
        let numerator = reserve_in * amount_out * 1000;
        let denominator = (reserve_out - amount_out) * (1000 - fee);
        return Math.floor(numerator / denominator - 1);
    }

    /*Diese Methode berechnet den maximalen Betrag, den ich tauschen kann, mit berücksichtigung einer Slippage Toleranz lower und upper. Wenn ich 100.000 USDC
    * swappen möchte, und ich innerhalb eines bestimmten slippage Bereich bleiben möchte, sagt mir diese Methode wie viel ich tatsächlich möglich ist zu tauschen. */

    getMaxAmountIn(reserve0, reserve1, decimals0, decimals1, fee, token0_in, max_amount_in, step_size, slippage_tolerance_lower, slippage_tolerance_upper) {
        let fee_pct = fee / 10000.0 / 100.0;
        let price_quote = this.reservesToPrice(reserve0, reserve1, decimals0, decimals1, token0_in);
        price_quote = price_quote * (1 - fee_pct);

        let decimal_in, decimal_out, reserve_in, reserve_out;

        if (token0_in) {
            decimal_in = decimals0;
            decimal_out = decimals1;
            reserve_in = reserve0;
            reserve_out = reserve1;
        } else {
            decimal_in = decimals1;
            decimal_out = decimals0;
            reserve_in = reserve1;
            reserve_out = reserve0;
        }

        let optimized_in = 0;
        let left = 0;
        let right = max_amount_in;

        let max_amount_out = this.getAmountOut(right * Math.pow(10, decimal_in), reserve_in, reserve_out, fee);
        let amount_out_rate = max_amount_out / right / Math.pow(10, decimal_out);
        let slippage = (price_quote - amount_out_rate) / price_quote;

        if (slippage < slippage_tolerance_lower) {
            optimized_in = right;
        } else {
            while (left <= right) {
                let mid = Math.floor((left + right) / 2 / step_size) * step_size;
                let amount_out = this.getAmountOut(mid * Math.pow(10, decimal_in), reserve_in, reserve_out, fee);
                amount_out_rate = amount_out / mid / Math.pow(10, decimal_out);
                slippage = (price_quote - amount_out_rate) / price_quote;
                if (slippage_tolerance_lower <= slippage && slippage <= slippage_tolerance_upper) {
                    optimized_in = mid;
                    break;
                } else {
                    if (slippage < slippage_tolerance_lower) {
                        left = mid;
                    } else {
                        right = mid;
                    }
                }
            }
        }
        return optimized_in;
    }
}

module.exports = {
    UniswapV2Simulator: UniswapV2Simulator
};