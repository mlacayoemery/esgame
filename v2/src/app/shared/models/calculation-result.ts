export class CalculationResult {
	results: Result[];
	/**
	 * How much of the allocation the calculator could actually use. Optional: only esgame's own
	 * tools/R sends it, and a calculator that does not is not misbehaving — so absent must mean
	 * "not reported", never "nothing matched".
	 */
	allocationCoverage?: AllocationCoverage;
}

/**
 * reclassify() silently ignores any id that is not in the base raster, so an allocation in the
 * wrong id space still returns 200 with finite scores that do not depend on it. These are the
 * numbers that tell the two apart.
 */
export class AllocationCoverage {
	/** Distinct ids the round sent. */
	allocated: number;
	/** How many of them exist in the base raster. */
	matched: number;
	/** matched / allocated, 0..1. */
	fraction: number;
}

export class Result {
    name: string;
    id: string;
    score: number;
    url: string;
}