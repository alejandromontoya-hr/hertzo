// Del navegador: paso de una imagen RGBA a PNG y descarga de un archivo generado en la página.

/** Codifica la imagen (RGBA, fila por fila) como PNG. */
export async function encodePng(pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('No se pudo crear la imagen PNG.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Ofrece los bytes como descarga con ese nombre de archivo. */
export function saveFile(data: Uint8Array<ArrayBuffer>, fileName: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([data], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // La descarga ya tomó el archivo; se suelta la memoria un momento después.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
