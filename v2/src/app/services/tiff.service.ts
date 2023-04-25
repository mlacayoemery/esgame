import { Injectable } from '@angular/core';
import { fromBlob, fromUrl, writeArrayBuffer } from 'geotiff';
import { from } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TiffService {

  public getTiffData(blob: Blob | null) {
    return from(this.tiffToArray(blob));
  }

  public writeTiffData(data: number[], columns: number) {
    return from(this.arrayToTiff(data, columns));
  }

  private async tiffToArray(blob: Blob | null) : Promise<number[]> {
    const tiff = await fromUrl("http://localhost:4200/assets/images/esgame_img_ag.tif"); //TODO: load blob data --> await fromBlob(blob);
    const image = await tiff.getImage();
    const raster = await image.readRasters({ interleave: true });
    const result = Array.from(raster.map(c => c as number));
    
    return result;
  }

  private async arrayToTiff(data: number[], columns: number) : Promise<Blob> {
    const height = data.length / columns;
    const buffer = writeArrayBuffer(data, { width: columns, height: height, GDAL_NODATA: "-1"}) as ArrayBufferLike;
    const result = new Blob([buffer], { type: 'application/octet-stream' });
    return result;
  }
}


