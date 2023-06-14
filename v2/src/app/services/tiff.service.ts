import { Injectable } from '@angular/core';
import { fromUrl, writeArrayBuffer } from 'geotiff';
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

	getGridGameBoard(url: string, defaultGradient: DefaultGradients, gameBoardType: GameBoardType, name: string) {
		return this.getTiffData(url).pipe(
			mergeMap(data => {
				let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];

				uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
				gradient = gradients.get(defaultGradient)!;
				legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))], isNegative: gameBoardType == GameBoardType.ConsequenceMap };

				fields = data.map((o, i) => {
					return new Field(i, new FieldType(gradient!.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
				});
				const gameBoard = new GameBoard(gameBoardType, fields, legend, name);

				return of(gameBoard);
			})
		);
	}

	getSvgGameBoard(url: string, gameBoardType: GameBoardType, name: string, defaultGradient?: DefaultGradients, customColors?: CustomColors) {
		if (!defaultGradient && !customColors) defaultGradient = DefaultGradients.Orange;
		if (defaultGradient) {
			return this.getTiffSvgData(url, gradients.get(defaultGradient)!).pipe(
				mergeMap(data => {
					let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];
					
					uniqueValues = Array.from(data.paths.keys()).sort((a, b) => a - b).filter(a => a > 0);
					console.log(uniqueValues.length);
					gradient = gradients.get(defaultGradient!);
					legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))], isNegative: gameBoardType == GameBoardType.ConsequenceMap };
					const maxValue = Math.max(...uniqueValues);
					const minValue = Math.min(...uniqueValues);
					
					fields = Array.from(data.paths).map(([key, value], i) => {
						console.log(key, data.nodata, key == data.nodata);
						return new Field(key, new FieldType(gradient?.calculateColor(1 / (maxValue - minValue) * (key - minValue)) ?? "", "CONFIGURED"), key, null, key != data.nodata, undefined, value);
					});
	
					const gameBoard = new GameBoard(gameBoardType, fields, legend, name, true, data.width, data.height, data.dataUrl);
	
					return of(gameBoard);
				})
			);
		} else {
			return this.getTiffSvgData(url, undefined, customColors).pipe(
				mergeMap(data => {
					console.log('custom colors');
					let uniqueValues: number[], legend: Legend, fields: Field[];
	
					uniqueValues = Array.from(data.paths.keys()).sort((a, b) => a - b).filter(a => a > 0);
					legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: customColors!.get(i) }))], isNegative: gameBoardType == GameBoardType.ConsequenceMap };
					const maxValue = Math.max(...uniqueValues);
					const minValue = Math.min(...uniqueValues);
	
					fields = Array.from(data.paths).map(([key, value], i) => {
						return new Field(key, new FieldType(customColors!.get(key), "CONFIGURED"), key, null, key != data.nodata, undefined, value);
					});
	
	
					const gameBoard = new GameBoard(gameBoardType, fields, legend, name, true, data.width, data.height, data.dataUrl);
	
					return of(gameBoard);
				})
			);
		}
	}

	getSvgBackground(url: string, customColors: CustomColors): Observable<string> {
		return this.getTiffSvgData(url, undefined, customColors).pipe(
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

	public getTiffSvgData(url: string, gradient?: Gradient, colors?: CustomColors) {
		return from(this.tiffToPaths(url, gradient, colors));
	}

	private async tiffToPaths(url: string, gradient?: Gradient, colors?: CustomColors) {
		const tiff = await fromUrl(url);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const array = Array.from(raster.map(c => Number.parseFloat(c.toString())));

		//TODO: Only if it is drawing map
		const paths = tiffToSvgPaths(array, { width: image.getWidth(), height: undefined, scale: 1 });
		const newArray = array.map(c => c < 0 ? 255 : c)
		const dataUrl = await this.arrayToImage(newArray, image.getWidth(), gradient, colors);
		const result = { width: image.getWidth(), height: image.getHeight(), paths, dataUrl, nodata: Number.parseFloat(image.fileDirectory.GDAL_NODATA) };

		return result;
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

	private async arrayToImage(data: number[], columns: number, gradient?: Gradient, colors?: CustomColors): Promise<string> {
		const height = data.length / columns;
		const tmpArray = []
		const uniqueValues = Array.from(new Set(data)).filter(c => c > 0 && c != 255).sort((a, b) => a - b);
		if (gradient) {
			const maxValue = Math.max(...uniqueValues);
			const minValue = Math.min(...uniqueValues);
			for (var i = 0; i < data.length; i++) {
				if (data[i] == 255 || data[i] < 0) {
					tmpArray.push(255, 255, 255, 0);
				} else {
					var toAdd = gradient.calculateColorRGB(1 / (maxValue - minValue) * (data[i] - minValue))
					tmpArray.push(...toAdd, 255);
				}
			}
		} else {
			data.forEach(value => {
				tmpArray.push(...colors!.getRgb(value)!);
			});
		}

		//const buffer = writeArrayBuffer(tmpArray, { width: columns, height: height, GDAL_NODATA: "-1" }) as ArrayBufferLike;
		const dataUrl = this.arrayToDataUrl(tmpArray, columns, height);
		return dataUrl;
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


