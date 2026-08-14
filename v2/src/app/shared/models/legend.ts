export class Legend {
    elements: LegendElement[];
	isNegative = false;
    isGradient = false;
    /**
     * True when the values behind this legend were rescaled to their own round.
     *
     * Consequence maps are: tools/R/calculator.r publishes each raster stretched with
     * `(x - min) / (max - min) * 100` over that round's own surface, so the numbers on the ramp
     * are 0-100 every round whatever the underlying exposure was. Printing those numbers reads
     * as an absolute quantity and is not one — this round's 100 is not last round's 100.
     * Suitability maps come from the dataset unstretched, so their numbers do mean something.
     */
    isRoundRelative = false;
}

export class LegendElement {
    forValue: number;
    color: string;
}