interface Options {
    width?: number;
    height?: number;
    scale?: number;
    offsetX?: number;
    offsetY?: number;
    /** The value meaning "no zone"; defaults to 0. Pass the raster's GDAL_NODATA. */
    undefinedValue?: number;
}
export declare function toIndex(x: number, y: number, width: number): number;
export default function tiffToSvgPaths(data: number[] | number[][], options?: Options): Map<number, string>;
export {};