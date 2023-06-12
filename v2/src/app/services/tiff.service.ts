import { Injectable } from '@angular/core';
import { fromUrl, writeArrayBuffer } from 'geotiff';
import { from, mergeMap, of } from 'rxjs';
import gradients, { DefaultGradients, Gradient } from '../shared/helpers/gradiants';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Legend } from '../shared/models/legend';
import { FieldType } from '../shared/models/field-type';
import { Field } from '../shared/models/field';
import tiffToSvgPaths from '../shared/helpers/svg/tiffToSvgPaths';

declare var Tiff: any;

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

	getSvgGameBoard(url: string, defaultGradient: DefaultGradients, gameBoardType: GameBoardType, name: string) {
		return this.getTiffSvgData(url, gradients.get(defaultGradient)!).pipe(
			mergeMap(data => {
				let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];

				uniqueValues = Array.from(data.paths.keys()).sort((a, b) => a - b).filter(a => a > 0);
				gradient = gradients.get(defaultGradient)!;
				legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))], isNegative: gameBoardType == GameBoardType.ConsequenceMap };
				const maxValue = Math.max(...uniqueValues);
				const minValue = Math.min(...uniqueValues);

				fields = Array.from(data.paths).map(([key, value], i) => {
					return new Field(i, new FieldType(gradient?.calculateColor(1 / (maxValue - minValue) * (key - minValue)) ?? "", "CONFIGURED"), key, null, key != 255, undefined, value);
				});

				const gameBoard = new GameBoard(gameBoardType, fields, legend, name, true, data.width, data.height, data.dataUrl);

				return of(gameBoard);
			})
		);
	}

	public getTiffData(url: string) {
		return from(this.tiffToArray(url));
	}

	public writeTiffData(data: number[], columns: number) {
		return from(this.arrayToTiff(data, columns));
	}

	public getTiffSvgData(url: string, gradient: Gradient) {
		return from(this.tiffToPaths(url, gradient));
	}

	private async tiffToPaths(url: string, gradient: Gradient) {
		const tiff = await fromUrl(url);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const array = Array.from(raster.map(c => c as number));

		//TODO: Only if it is drawing map
		const paths = tiffToSvgPaths(array, { width: image.getWidth(), height: undefined, scale: 1 });
		const newArray = array.map(c => c < 0 ? 255 : c)
		const buffer = await this.arrayToTiffTest(newArray, image.getWidth(), gradient);
		var tiffObject = new Tiff({ buffer: buffer });
		let dataUrl = tiffObject.toDataURL();
		const result = { width: image.getWidth(), height: image.getHeight(), paths, dataUrl };

		return result;
	}


	private async tiffToArray(url: string): Promise<number[]> {
		const tiff = await fromUrl(url);
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const result = Array.from(raster.map(c => c as number));

		return result;
	}

	private async arrayToTiff(data: number[], columns: number): Promise<Blob> {
		const height = data.length / columns;
		const buffer = writeArrayBuffer(data, { width: columns, height: height, GDAL_NODATA: "-1" }) as ArrayBufferLike;
		const result = new Blob([buffer], { type: 'application/ocet-stream' });
		return result;
	}

	private async arrayToTiffTest(data: number[], columns: number, gradient: Gradient): Promise<ArrayBufferLike> {
		const height = data.length / columns;
		const tmpArray = []
		const uniqueValues = Array.from(new Set(data)).filter(c => c > 0 && c != 255).sort((a, b) => a - b);
		const maxValue = Math.max(...uniqueValues);
		const minValue = Math.min(...uniqueValues);
		for (var i = 0; i < data.length; i++) {
			if (data[i] == 255 || data[i] < 0) {
				tmpArray.push(255, 255, 255);
			} else {
				var toAdd = gradient.calculateColorRGB(1 / (maxValue - minValue) * (data[i] - minValue))
				tmpArray.push(...toAdd);
			}
		}
		const buffer = writeArrayBuffer(tmpArray, { width: columns, height: height, GDAL_NODATA: "-1" }) as ArrayBufferLike;
		return buffer;
	}
}


