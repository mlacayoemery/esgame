import { Injectable } from '@angular/core';
import { fromBlob, fromUrl, writeArrayBuffer } from 'geotiff';
import { GameBoard } from '../shared/models/game-board';

@Injectable({
  providedIn: 'root'
})
export class TiffService {

  constructor() { }

  async tiffToArray(blob: Blob | null) : Promise<number[]> {
    const tiff = await fromUrl("http://localhost:4200/assets/images/esgame_img_ag_hunt.tif"); //await fromBlob(blob);
    const image = await tiff.getImage();

    const raster = await image.readRasters({ interleave: true });
    const result = Array.from(raster.map(c => c as number));
    
    return result;
  }

  async arrayToTiff(data: number[], columns: number) : Promise<Blob> {
    const height = data.length / columns;
    const buffer = writeArrayBuffer(data, { width: columns, height: height, GDAL_NODATA: "-1"}) as ArrayBufferLike;
    const result = new Blob([buffer], { type: 'application/octet-stream' });
    return result;
  }

}


