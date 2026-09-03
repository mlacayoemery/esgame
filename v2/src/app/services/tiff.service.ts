import { Injectable } from '@angular/core';
import { fromBlob, fromUrl } from 'geotiff';
import { Observable, from, mergeMap, of } from 'rxjs';
import gradients, { colorToRgb, CustomColors, DefaultGradients, Gradient } from '../shared/helpers/gradients';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Legend } from '../shared/models/legend';
import { FieldType } from '../shared/models/field-type';
import { Field } from '../shared/models/field';
import tiffToSvgPaths from '../shared/helpers/svg/tiffToSvgPaths';

@Injectable({
	providedIn: 'root'
})
export class TiffService {

	getGridGameBoard(id: string, url: string, defaultGradient: DefaultGradients, gameBoardType: GameBoardType) {
		return this.getTiffData(url).pipe(
			mergeMap(data => {
				let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];

				uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
				gradient = gradients.get(defaultGradient)!;
				// isRoundRelative: false — a grid board's values come from the dataset TIFF unchanged, so
				// its legend numbers mean what they say. Only calculator.r's per-round stretch is
				// relative, and that is the SVG path below.
				legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))], isNegative: gameBoardType == GameBoardType.ConsequenceMap, isGradient: false, isRoundRelative: false };

				fields = data.map((o, i) => {
					return new Field(i, new FieldType(gradient!.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
				});
				const gameBoard = new GameBoard(id, gameBoardType, fields, legend);

				return of(gameBoard);
			})
		);
	}

	getSvgGameBoard(id: string, url: string, gameBoardType: GameBoardType, defaultGradient: DefaultGradients, overlay: GameBoard, minValue: number, maxValue: number, paletted = false) {
		return this.getTiffSvgDataUrl(url, minValue, maxValue, gradients.get(defaultGradient)!, undefined, paletted).pipe(
			mergeMap(data => {
				let gradient: Gradient | undefined, legend: Legend, fields: Field[];
        gradient = gradients.get(defaultGradient!);
				// PALETTED boards are labelled the way a grid board is, because they ARE a grid
				// board's data: a handful of distinct values, one palette colour each. The ramp
				// below describes a continuous stretch, which such a raster does not have — and
				// isRoundRelative is false for the same reason the grid path sets it false: these
				// values come from the dataset unchanged, so the numbers mean what they say.
				if (paletted) {
					const distinct = this.distinctValues(data.numRaster);
					legend = {
						elements: distinct.map((value, i) => ({ forValue: value, color: gradient!.colors[i] })),
						isNegative: gameBoardType == GameBoardType.ConsequenceMap,
						isGradient: false,
						isRoundRelative: false
					};
				} else {
				// isRoundRelative on consequence maps ONLY. Those are the rasters calculator.r
				// stretches to each round's own min/max; a suitability map is dataset data whose
				// values are what they say they are.
				legend = { elements: [{ forValue: minValue, color: gradient!.calculateColor(1) }, { forValue: maxValue, color: gradient!.calculateColor(0) }], stops: gradient!.rampColors(), isNegative: gameBoardType == GameBoardType.ConsequenceMap, isGradient: true, isRoundRelative: gameBoardType == GameBoardType.ConsequenceMap };
				}
				fields = overlay.fields.map((field) => {
					return {
						...field,
						score: Math.round(data.numRaster[field.startPos]),
					}
				});

				const gameBoard = new GameBoard(id, gameBoardType, fields, legend, true, data.width, data.height, data.dataUrl);

				return of(gameBoard);
			})
		);
	}

	getOverlayGameBoard(id: string, url: string, gameBoardType: GameBoardType) {
		return this.getTiffSvgData(url).pipe(
			mergeMap(data => {
				let fields: Field[];

				fields = data.pathArray.map(path => {
					return new Field(path.id, new FieldType("", "CONFIGURED"), 0, null, path.id != data.nodata!, undefined, path.path, path.startPos);
				});

				return of(new GameBoard(id, gameBoardType, fields, undefined, true, data.width, data.height));
			})
		);
	}

	getSvgBackground(url: string, minValue: number, maxValue: number, customColors: CustomColors): Observable<string> {
		return this.getTiffSvgDataUrl(url, minValue, maxValue, undefined, customColors).pipe(
			mergeMap(data => {
				return of(data.dataUrl);
			})
		);
	}

	public getTiffData(url: string) {
		return from(this.tiffToArray(url));
	}

	public getTiffSvgDataUrl(url: string, minValue: number, maxValue: number, gradient?: Gradient, colors?: CustomColors, paletted = false) {
		return from(this.prepareDataUrl(url, minValue, maxValue, gradient, colors, paletted));
	}

	public getTiffSvgData(url: string) {
		return from(this.tiffToPaths(url));
	}

	/**
	 * Fetch a raster, failing with a message that names what actually went wrong.
	 *
	 * `fetch` only rejects on network errors, so a 404 resolves and its HTML body flows
	 * happily into `blob()`. geotiff.js then reads `<!` as the byte order and throws
	 * "Invalid byte order value." — which names neither the status nor the file, and is
	 * indistinguishable from a genuinely corrupt raster.
	 *
	 * That is not hypothetical: it is how the missing `Consequence_*_Clip.tif` files went
	 * unnoticed (see docs/verification-status.rst), because the e2e server answered every
	 * path with index.html.
	 */
	private async fetchRaster(url: string): Promise<Blob> {
		let response: Response;
		try {
			response = await fetch(url);
		} catch (cause) {
			// A genuine network error. Re-thrown with the URL, which the original does not carry.
			throw new Error(`Could not reach ${url}: ${(cause as Error)?.message ?? cause}`, { cause });
		}
		if (!response.ok) {
			throw new Error(`Could not load raster ${url}: ${response.status} ${response.statusText}`);
		}
		const blob = await response.blob();
		// A 200 is not proof of a raster. An SPA fallback serving index.html is the common case,
		// and it is worth naming here rather than leaving it to the decoder — checked by sniffing
		// the content rather than trusting Content-Type, which servers get wrong for .tif.
		const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
		// Byte order, then the version word read in that order. 42 is TIFF; 43 is BigTIFF, which
		// geotiff.js also reads — rejecting it here would break files the decoder handles fine.
		const littleEndian = head[0] === 0x49 && head[1] === 0x49;
		const bigEndian = head[0] === 0x4d && head[1] === 0x4d;
		const version = littleEndian ? head[2] | (head[3] << 8)
			: bigEndian ? (head[2] << 8) | head[3]
				: -1;
		const isTiff = head.length >= 4 && (littleEndian || bigEndian) && (version === 42 || version === 43);
		if (!isTiff) {
			throw new Error(
				`${url} returned ${response.status} but the body is not a GeoTIFF `
				+ `(starts with ${JSON.stringify(await blob.slice(0, 16).text())}). `
				+ `A server answering every path with index.html does exactly this.`);
		}
		return blob;
	}

	/**
	 * The raster's distinct values, ascending — INCLUDING its nodata.
	 *
	 * Deliberately the same expression getGridGameBoard uses, because the whole point of a paletted
	 * SVG board is that it draws what the grid board draws. Excluding nodata shifted every class
	 * one palette entry: these rasters declare nodata 0 and hold [0, 75, 150, 225, 300, 375], so
	 * the grid board gives 75 colors[1] and the SVG board was giving it colors[0].
	 *
	 * Shared by the paletted image and the paletted legend so the two cannot disagree about which
	 * colour a value gets — they index the same list.
	 */
	private distinctValues(data: number[]): number[] {
		return Array.from(new Set(data)).sort((a, b) => a - b);
	}

	private async prepareDataUrl(url: string, minValue: number, maxValue: number, gradient?: Gradient, colors?: CustomColors, paletted = false) {
		const tmp = await this.fetchRaster(url);
		const tiff = await fromBlob(tmp);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const numRaster = Array.from(raster.map(c => c as number));
		const width = image.getWidth();
		const height = image.getHeight();
		const nodata = image.getGDALNoData()!;

		const dataUrl = await this.arrayToImage(numRaster, width, nodata, minValue, maxValue, gradient, colors, paletted);
		return { width, height, dataUrl, nodata, numRaster };
	}

	/**
	 * geotiff's own fetcher, used where the whole file is not wanted up front. Its failures say
	 * "Error fetching data." and nothing else — not the status, not which raster — so they are
	 * re-thrown carrying the URL. The magic-byte check in fetchRaster does not apply here:
	 * fromUrl issues range requests and never holds the whole body.
	 */
	private async openRemote(url: string) {
		try {
			return await fromUrl(url);
		} catch (cause) {
			throw new Error(`Could not load raster ${url}: ${(cause as Error)?.message ?? cause}`, { cause });
		}
	}

	private async tiffToPaths(url: string) {
		const tiff = await this.openRemote(url);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const numRaster = Array.from(raster.map(c => Number.parseFloat(c.toString())));
		const paths = tiffToSvgPaths(numRaster, { width: image.getWidth(), height: undefined, scale: 1 });
		let pathArray: { id: number, path: string, startPos: number }[] = [];
		paths.forEach((val, key) => {
			pathArray.push({
				id: key,
				path: val,
				startPos: numRaster.indexOf(key)
			});
		});
		return { width: image.getWidth(), height: image.getHeight(), pathArray, nodata: image.getGDALNoData() };
	}

	private async tiffToArray(url: string): Promise<number[]> {
		const tiff = await this.openRemote(url);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		return Array.from(raster.map(c => Number.parseFloat(c.toString())));
	}

	private async arrayToImage(data: number[], columns: number, noData: number, minValue: number, maxValue: number, gradient?: Gradient, colors?: CustomColors, paletted = false): Promise<string> {
		const height = data.length / columns;
		const tmpArray: number[] = [];
		if (gradient && paletted) {
			// One palette colour per distinct value, exactly as getGridGameBoard does, and for the
			// same reason: these rasters hold a handful of classes, not a continuous surface.
			// Stretching them across minValue..maxValue is not merely a different look, it is wrong
			// — the agriculture suitability raster runs to 375 against a declared maximum of 100, so
			// every value above 100 clipped to the same extreme colour and most of the map came out
			// one flat shade.
			// No nodata hole. The grid board paints a nodata cell its palette colour like any other
			// — that tan is the agriculture board's background, and skipping it here left the same
			// map with a white surround where the static one has land.
			const distinct = this.distinctValues(data);
			const index = new Map(distinct.map((value, i) => [value, i]));
			data.forEach(value => {
				tmpArray.push(...colorToRgb(gradient.colors[index.get(value) ?? 0]));
			});
		} else if (gradient) {
			data.forEach(value => {
				if (value == noData) {
					tmpArray.push(255, 255, 255, 0);
				} else {
					tmpArray.push(...gradient.calculateColorRGB(1 - 1 / (maxValue - minValue) * (value - minValue)), 255);
				}
			});
		} else if (colors) {
			data.forEach(value => {
				tmpArray.push(...colors!.getRgb(value)!);
			});
		}
		return this.arrayToDataUrl(tmpArray, columns, height);
	}

	// Source: https://stackoverflow.com/questions/22823752/creating-image-from-array-in-javascript-and-html5
	private arrayToDataUrl(data: number[], width: number, height: number) {
		let canvas = document.createElement('canvas'),
			ctx = canvas.getContext('2d')!;
		canvas.width = width;
		canvas.height = height;
		let image_data = ctx.createImageData(width, height);
		image_data.data.set(data);
		ctx.putImageData(image_data, 0, 0);
		return canvas.toDataURL();
	}
}


