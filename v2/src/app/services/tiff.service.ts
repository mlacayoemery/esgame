import { Injectable } from '@angular/core';
import { fromBlob, fromUrl, writeArrayBuffer } from 'geotiff';
import { Observable, from, mergeMap, of } from 'rxjs';
import gradients, { CustomColors, DefaultGradients, Gradient } from '../shared/helpers/gradients';
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

	getGridGameBoard(id : string, url: string, defaultGradient: DefaultGradients, gameBoardType: GameBoardType) {
		return this.getTiffData(url).pipe(
			mergeMap(data => {
				let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];

				uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
				gradient = gradients.get(defaultGradient)!;
				legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))], isNegative: gameBoardType == GameBoardType.ConsequenceMap, isGradient: false };

				fields = data.map((o, i) => {
					return new Field(i, new FieldType(gradient!.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
				});
				const gameBoard = new GameBoard(id, gameBoardType, fields, legend);

				return of(gameBoard);
			})
		);
	}

	getSvgGameBoard(id: string, url: string, gameBoardType: GameBoardType, defaultGradient: DefaultGradients, overlay: GameBoard) {
		return this.getTiffSvgDataUrl(url, gradients.get(defaultGradient)!).pipe(
			mergeMap(data => {
				let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];
				
				uniqueValues = Array.from(new Set(data.numRaster)).filter(c => c != data.nodata).sort((a, b) => a - b);
				gradient = gradients.get(defaultGradient!);
				legend = { elements: [{forValue: 0, color: gradient!.calculateColor(1)}, {forValue: 100, color: gradient!.calculateColor(0)}], isNegative: gameBoardType == GameBoardType.ConsequenceMap, isGradient: true };
				fields = overlay.fields.map((field) => {
					return {
						...field,
						score: Math.round(data.numRaster[field.startPos] * 100),
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

	getSvgBackground(url: string, customColors: CustomColors): Observable<string> {
		return this.getTiffSvgDataUrl(url, undefined, customColors).pipe(
			mergeMap(data => {
				return of(data.dataUrl);
			})
		);
	}

	public getTiffData(url: string) {
		return from(this.tiffToArray(url));
	}

	public writeTiffData(data: number[], columns: number) {
		return from(this.arrayToTiff(data, columns));
	}

	public getTiffSvgDataUrl(url: string, gradient?: Gradient, colors?: CustomColors) {
		return from(this.prepareDataUrl(url, gradient, colors));
	}

	public getTiffSvgData(url: string) {
		return from(this.tiffToPaths(url));
	}

	private async prepareDataUrl(url: string, gradient?: Gradient, colors?: CustomColors) {
		//fromURL throws error
		const tmp = await fetch(url).then(r => r.blob());
		const tiff = await fromBlob(tmp);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const numRaster = Array.from(raster.map(c => c as number));
		const width = image.getWidth();
		const height = image.getHeight();
		const nodata = image.getGDALNoData()!;

		const dataUrl = await this.arrayToImage(numRaster, width, nodata, gradient, colors);
		return { width, height, dataUrl, nodata, numRaster };
	}

	private async tiffToPaths(url: string) {
		const tiff = await fromUrl(url);
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
		const tiff = await fromUrl(url);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const result = Array.from(raster.map(c => Number.parseFloat(c.toString())));

		return result;
	}

	private async arrayToTiff(data: number[], columns: number): Promise<Blob> {
		const height = data.length / columns;
		const buffer = writeArrayBuffer(data, { width: columns, height: height, GDAL_NODATA: "-1" }) as ArrayBufferLike;
		const result = new Blob([buffer], { type: 'application/octet-stream' });
		return result;
	}

	private async arrayToImage(data: number[], columns: number, noData: number, gradient?: Gradient, colors?: CustomColors): Promise<string> {
		const height = data.length / columns;
		const tmpArray = []
		const uniqueValues = Array.from(new Set(data)).filter(c => c != noData).sort((a, b) => a - b);
		if (gradient) {
			const maxValue = 1; //Math.max(...uniqueValues); // TODO: Evtl verschieben in Konfiguration?
			const minValue = 0; //Math.min(...uniqueValues);
			for (var i = 0; i < data.length; i++) {
				if (data[i] == noData) {
					tmpArray.push(255, 255, 255, 0);
				} else {
					var toAdd = gradient.calculateColorRGB(1 - 1 / (maxValue - minValue) * (data[i] - minValue))
					tmpArray.push(...toAdd, 255);
				}
			}
		} else if (colors) {
			data.forEach(value => {
				tmpArray.push(...colors!.getRgb(value)!);
			});
		}

		//const buffer = writeArrayBuffer(tmpArray, { width: columns, height: height, GDAL_NODATA: "-1" }) as ArrayBufferLike;
		return this.arrayToDataUrl(tmpArray, columns, height);
	}

	// Source: https://stackoverflow.com/questions/22823752/creating-image-from-array-in-javascript-and-html5
	private arrayToDataUrl(data: number[], width: number, height: number) {
		var canvas = document.createElement('canvas'),
    	ctx = canvas.getContext('2d')!;

		canvas.width = width;
		canvas.height = height;

		var idata = ctx.createImageData(width, height);

		idata.data.set(data);

		ctx.putImageData(idata, 0, 0);

		return canvas.toDataURL();
	}
}


