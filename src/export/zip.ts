// Archivo ZIP sin compresión, el contenedor de un KMZ. Módulo puro. Las imágenes PNG ya van
// comprimidas, así que guardarlas tal cual casi no agranda el archivo y evita una librería.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (el de ZIP y PNG) de los bytes. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_RECORD = 22;
/** Fecha DOS del 1 de enero de 1980: el archivo sale idéntico cada vez con los mismos datos. */
const DOS_DATE = 0x0021;

/** Empaqueta los archivos, en ese orden, sin comprimir. */
export function zipStore(entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const files = entries.map((e) => ({ name: encoder.encode(e.name), data: e.data, crc: crc32(e.data), offset: 0 }));
  const localSize = files.reduce((sum, f) => sum + LOCAL_HEADER + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((sum, f) => sum + CENTRAL_HEADER + f.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + END_RECORD);
  const view = new DataView(out.buffer);
  let p = 0;

  // Campos comunes a la cabecera local y a la del directorio, desde «versión necesaria».
  const writeCommon = (f: (typeof files)[number]) => {
    view.setUint16(p, 20, true); // versión 2.0
    view.setUint16(p + 2, 0, true); // sin banderas
    view.setUint16(p + 4, 0, true); // método 0: sin comprimir
    view.setUint16(p + 6, 0, true); // hora
    view.setUint16(p + 8, DOS_DATE, true);
    view.setUint32(p + 10, f.crc, true);
    view.setUint32(p + 14, f.data.length, true); // tamaño comprimido
    view.setUint32(p + 18, f.data.length, true); // tamaño original
    view.setUint16(p + 22, f.name.length, true);
    view.setUint16(p + 24, 0, true); // sin campo extra
    p += 26;
  };

  for (const f of files) {
    f.offset = p;
    view.setUint32(p, 0x04034b50, true);
    p += 4;
    writeCommon(f);
    out.set(f.name, p);
    p += f.name.length;
    out.set(f.data, p);
    p += f.data.length;
  }

  const centralStart = p;
  for (const f of files) {
    view.setUint32(p, 0x02014b50, true);
    view.setUint16(p + 4, 20, true); // hecho con la versión 2.0
    p += 6;
    writeCommon(f);
    view.setUint16(p, 0, true); // sin comentario
    view.setUint16(p + 2, 0, true); // disco 0
    view.setUint16(p + 4, 0, true); // atributos internos
    view.setUint32(p + 6, 0, true); // atributos externos
    view.setUint32(p + 10, f.offset, true);
    p += 14;
    out.set(f.name, p);
    p += f.name.length;
  }

  view.setUint32(p, 0x06054b50, true);
  view.setUint16(p + 4, 0, true); // este disco
  view.setUint16(p + 6, 0, true); // disco del directorio
  view.setUint16(p + 8, files.length, true);
  view.setUint16(p + 10, files.length, true);
  view.setUint32(p + 12, p - centralStart, true);
  view.setUint32(p + 16, centralStart, true);
  view.setUint16(p + 20, 0, true); // sin comentario
  return out;
}
