import { Injectable } from '@angular/core';
import { fromBlob, fromUrl, writeArrayBuffer } from 'geotiff';
import { from, merge, mergeMap, of } from 'rxjs';
import gradients, { DefaultGradients } from '../shared/helpers/gradiants';
import { GameBoard } from '../shared/models/game-board';
import { GameBoardType } from '../shared/models/game-board-type';
import { Legend } from '../shared/models/legend';
import { FieldType } from '../shared/models/field-type';
import { Field } from '../shared/models/field';

@Injectable({
	providedIn: 'root'
})
export class TiffService {

	getGameBoard(url: string, defaultGradient: DefaultGradients, gameBoardType: GameBoardType, name: string) {
		return this.getTiffData(url).pipe(
			mergeMap(data => {
				var uniqueValues = Array.from(new Set(data)).sort((a, b) => a - b);
				var gradient = gradients.get(defaultGradient)!;
				var legend: Legend = { elements: [...uniqueValues.map((o, i) => ({ forValue: o, color: gradient.colors[i]}))] };

				var fields = data.map((o, i) => {
					return new Field(i, new FieldType(gradient.colors[(uniqueValues.indexOf(o))] as string, "CONFIGURED"), o);
				});

				var gameBoard = new GameBoard(gameBoardType, fields, legend, name);

				return of(gameBoard);
			})
		);
	}

	public getTiffData(url: string) {
		return from(this.tiffToArray(url));
	}

	// public getTiffData(blob: Blob | null) {
	// 	return from(this.tiffToArray(blob));
	// }

	public writeTiffData(data: number[], columns: number) {
		return from(this.arrayToTiff(data, columns));
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
		const result = new Blob([buffer], { type: 'application/octet-stream' });
		return result;
	}
}


