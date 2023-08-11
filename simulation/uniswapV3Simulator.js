const {ethers} = require("ethers");
class UniswapV3Simulator{

    /*Diese Methode konvertiert den gegebenen sqrtx96-Wert in einen Tick-Wert.
    Ticks sind spezifische Preisniveaus, die in Uniswap V3 definiert sind.*/
    sqrtx96ToTick(sqrtx96) {
        return Math.floor(
            Math.log(
                sqrtx96 * Math.pow(2, -96),
                Math.sqrt(1.0001)
            )
        );
    }


    /* Diese Methode berechnet den Preis eines Tokens in Bezug auf den anderen, basierend auf dem sqrtx96-Wert, den Dezimalstellen
    der beiden Tokens und einer Booleschen Variable, die angibt, ob Token0 eingezahlt wird*/
    sqrtx96ToPrice(sqrtx96, decimals0, decimals1, token0in) {
        const sqrtValue = parseFloat(sqrtx96.toString());
        let price = Math.pow(sqrtValue / Math.pow(2, 96), 2) * Math.pow(10, (decimals0 - decimals1));
        return token0in ? price : 1 / price;
    }




    /* Diese Methode konvertiert einen gegebenen Tick-Wert in einen Preis, basierend auf den Dezimalstellen der beiden Tokens.*/
    tickToPrice(tick, decimals0, decimals1) {
        return Math.pow(1.0001, tick) * Math.pow(10, (decimals0 - decimals1));
    }


    /*Diese Methode berechnet den Preisbereich eines bestimmten Ticks. Sie nimmt den aktuellen Tick,
    den Tick-Abstand und die Dezimalstellen der beiden Tokens als Eingabe und gibt den Preisbereich zurück.*/


    tickToPriceRange(current_tick, tick_spacing, decimals0, decimals1, token0_in) {
        let lower_tick = tick_spacing * Math.floor(current_tick / tick_spacing);
        let upper_tick = tick_spacing * Math.floor(current_tick / tick_spacing + 1);
        let ticks = [lower_tick, upper_tick];
        let price_range = ticks.map(tick => this.tickToPrice(tick, decimals0, decimals1));
        return token0_in ? price_range : [1 / price_range[1], 1 / price_range[0]];
    }


}

module.exports = {
    UniswapV3Simulator:UniswapV3Simulator
};