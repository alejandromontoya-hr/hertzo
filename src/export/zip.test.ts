import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip';

const text = (s: string) => new TextEncoder().encode(s);

describe('crc32', () => {
  it('"123456789" da 0xCBF43926, el valor de control del estándar', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });

  it('sin datos da 0', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('zipStore', () => {
  // Un archivo "a.txt" con "hola" (4 bytes):
  // cabecera local 30 + 5 del nombre + 4 de datos = 39; directorio 46 + 5 = 51; cierre 22.
  const zip = zipStore([{ name: 'a.txt', data: text('hola') }]);
  const view = new DataView(zip.buffer);

  it('mide 39 + 51 + 22 = 112 bytes', () => {
    expect(zip.length).toBe(112);
  });

  it('cada bloque empieza con su firma: local en 0, directorio en 39 y cierre en 90', () => {
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(39, true)).toBe(0x02014b50);
    expect(view.getUint32(90, true)).toBe(0x06054b50);
  });

  it('el cierre dice 1 archivo y un directorio de 51 bytes que empieza en 39', () => {
    expect(view.getUint16(90 + 10, true)).toBe(1);
    expect(view.getUint32(90 + 12, true)).toBe(51);
    expect(view.getUint32(90 + 16, true)).toBe(39);
  });

  it('guarda los datos sin comprimir (método 0), con su tamaño y su CRC', () => {
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint32(14, true)).toBe(crc32(text('hola')));
    expect(view.getUint32(18, true)).toBe(4);
    expect(view.getUint32(22, true)).toBe(4);
    expect(new TextDecoder().decode(zip.subarray(30, 35))).toBe('a.txt');
    expect(new TextDecoder().decode(zip.subarray(35, 39))).toBe('hola');
  });

  it('con dos archivos, el directorio del segundo apunta a su cabecera local', () => {
    // Primero: 30 + 5 + 4 = 39 bytes; el segundo empieza en 39.
    const two = zipStore([
      { name: 'a.txt', data: text('hola') },
      { name: 'b.png', data: new Uint8Array([1, 2, 3]) },
    ]);
    const v = new DataView(two.buffer);
    // Segundo local: 30 + 5 + 3 = 38 → directorio en 77; primera entrada 51 → segunda en 128.
    expect(v.getUint32(77 + 51, true)).toBe(0x02014b50);
    expect(v.getUint32(77 + 51 + 42, true)).toBe(39);
  });
});
