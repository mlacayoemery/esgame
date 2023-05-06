import { Injectable } from '@angular/core';
import { fromBlob, fromUrl, writeArrayBuffer } from 'geotiff';
import { from, merge, mergeMap, of } from 'rxjs';
import gradients, { DefaultGradients, Gradient } from '../shared/helpers/gradiants';
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

	getGameBoard(url: string, defaultGradient: DefaultGradients, gameBoardType: GameBoardType, name: string, isSvg: boolean = false) {
		if (!isSvg) {
			return this.getTiffData(url).pipe(
				mergeMap(data => {
					let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];

					uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
					gradient = gradients.get(defaultGradient)!;
					legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))] };

					fields = data.map((o, i) => {
						return new Field(i, new FieldType(gradient!.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
					});
					const gameBoard = new GameBoard(gameBoardType, fields, legend, name);

					return of(gameBoard);
				})
			);
		} else {
			return this.getTiffSvgData(url).pipe(
				mergeMap(data => {
					let uniqueValues: number[], gradient: Gradient | undefined, legend: Legend, fields: Field[];

					uniqueValues = Array.from(data.paths.keys()).sort((a, b) => a - b);
					gradient = gradients.get(defaultGradient)!;
					legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient!.colors[i] }))] };
					const maxValue = Math.max(...uniqueValues);
					
					fields = Array.from(data.paths).map(([key, value], i) => {
						return new Field(i, new FieldType(gradient?.calculateColor(1 / maxValue * key) ?? "", "CONFIGURED"), key, null, undefined, undefined, value);
					});

					const gameBoard = new GameBoard(gameBoardType, fields, legend, name, true, data.width, data.height);

					return of(gameBoard);
				})
			);
		}
	}

	public getTiffData(url: string) {
		return from(this.tiffToArray(url));
	}

	public writeTiffData(data: number[], columns: number) {
		return from(this.arrayToTiff(data, columns));
	}

	public getTiffSvgData(url: string) {
		return from(this.tiffToPaths(url));
	}

	private async tiffToPaths(url: string) {
		const tiff = await fromUrl(url); 
		const image = await tiff.getImage();
		const raster = await image.readRasters({ interleave: true });
		const array = Array.from(raster.map(c => c as number));


		const paths = tiffToSvgPaths(array, { width: image.getWidth(), height: undefined, scale: 1 });

		paths.delete(255);

		const result = { width: image.getWidth(), height: image.getHeight(), paths };

		return result;
	}


	private async tiffToArray(url: string): Promise<number[]> {
		const tiff = await fromUrl(url); //TODO: load blob data --> await fromBlob(blob);
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
}


