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

    /**
     * The colours the map is actually interpolated through, lightest first, as bare 6-digit hex.
     *
     * `elements` carries the two LABELLED ends and nothing between, which was enough while a
     * continuous map was a straight line between two colours. It is not one any more: the six
     * built-in gradients are ColorBrewer 5-class palettes and the map passes through all five, so
     * a legend built from the two ends alone would show a different ramp from the map beside it —
     * muddy through the middle where the map is saturated. Same defect as printing 0-100 over a
     * round-relative stretch: a legend that does not describe its map.
     *
     * Optional, and the legend falls back to the two ends when it is absent.
     */
    stops?: string[];
}

export class LegendElement {
    forValue: number;
    color: string;
}