import { describe, expect, it } from 'vitest';
import { parseProject, projectFileName, projectJson, readNumbers } from './projectFile';

// Un lector de prueba: acepta datos con un número «n».
const readN = (d: unknown) =>
  typeof d === 'object' && d !== null && typeof (d as { n: unknown }).n === 'number' ? { n: (d as { n: number }).n } : null;
const savedAt = new Date(2026, 9, 26, 21, 30);

describe('projectJson y projectFileName', () => {
  it('el 26 de octubre de 2026 el archivo se llama hertzo-interiores-2026-10-26.json', () => {
    expect(projectFileName('interiores', savedAt)).toBe('hertzo-interiores-2026-10-26.json');
  });

  it('el contenido dice app, simulador, versión 1, fecha y datos', () => {
    const file = JSON.parse(projectJson('cavernas', { n: 3 }, savedAt));
    expect(file).toMatchObject({ app: 'hertzo', scenario: 'cavernas', version: 1, data: { n: 3 } });
    expect(new Date(file.savedAt).getTime()).toBe(savedAt.getTime());
  });
});

describe('parseProject', () => {
  it('lo que se guarda se vuelve a abrir igual', () => {
    expect(parseProject(projectJson('interiores', { n: 7 }, savedAt), 'interiores', readN)).toEqual({ ok: true, data: { n: 7 } });
  });

  it('un archivo que no es JSON no se abre', () => {
    expect(parseProject('hola', 'interiores', readN)).toEqual({ ok: false, message: 'El archivo no es un proyecto de Hertzo: no se pudo leer.' });
  });

  it('un JSON de otra aplicación no se abre', () => {
    expect(parseProject('{"n": 7}', 'interiores', readN)).toEqual({ ok: false, message: 'El archivo no es un proyecto de Hertzo.' });
  });

  it('un proyecto de Cavernas abierto en Interiores dice dónde abrirlo', () => {
    expect(parseProject(projectJson('cavernas', { n: 7 }, savedAt), 'interiores', readN)).toEqual({
      ok: false,
      message: 'Es un proyecto de Cavernas: ábrelo en esa página.',
    });
  });

  it('una versión más nueva del formato (2) no se abre', () => {
    const newer = JSON.stringify({ app: 'hertzo', scenario: 'interiores', version: 2, data: { n: 7 } });
    expect(parseProject(newer, 'interiores', readN).ok).toBe(false);
  });

  it('si el lector no acepta los datos, avisa que está dañado', () => {
    expect(parseProject(projectJson('interiores', { n: 'siete' }, savedAt), 'interiores', readN)).toEqual({
      ok: false,
      message: 'El proyecto de Interiores está incompleto o dañado; no se cambió nada.',
    });
  });
});

describe('readNumbers', () => {
  it('acepta 4 umbrales [-50, -60, -67, -75] y rechaza 3, texto o NaN', () => {
    expect(readNumbers([-50, -60, -67, -75], 4)).toEqual([-50, -60, -67, -75]);
    expect(readNumbers([-50, -60, -67], 4)).toBeNull();
    expect(readNumbers([-50, '-60', -67, -75], 4)).toBeNull();
    expect(readNumbers([-50, Number.NaN, -67, -75], 4)).toBeNull();
  });
});
