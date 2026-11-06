import { describe, expect, it } from 'vitest';
import { clutterLabel, clutterQuery, parseClutter } from './clutterControl';

describe('parseClutter', () => {
  it('?entorno=urbano usa la altura de la norma: 15 m', () => {
    expect(parseClutter(new URLSearchParams('entorno=urbano'))).toEqual({ type: 'urbano', heightM: 15 });
  });

  it('?entorno=urbano&altura-entorno=6 respeta la altura escrita (los techos de la feria)', () => {
    expect(parseClutter(new URLSearchParams('entorno=urbano&altura-entorno=6'))).toEqual({ type: 'urbano', heightM: 6 });
  });

  it('sin entorno, o uno que no existe, es terreno limpio', () => {
    expect(parseClutter(new URLSearchParams(''))).toBeNull();
    expect(parseClutter(new URLSearchParams('entorno=selva'))).toBeNull();
  });
});

describe('clutterQuery', () => {
  it('la altura va en la dirección solo si no es la de la norma', () => {
    expect(clutterQuery({ type: 'urbano-denso', heightM: 20 })).toEqual({ entorno: 'urbano-denso', altura: null });
    expect(clutterQuery({ type: 'urbano', heightM: 6 })).toEqual({ entorno: 'urbano', altura: '6' });
    expect(clutterQuery(null)).toEqual({ entorno: null, altura: null });
  });
});

describe('clutterLabel', () => {
  it('"urbano o arbolado, 15 m"', () => {
    expect(clutterLabel({ type: 'urbano', heightM: 15 })).toBe('urbano o arbolado, 15 m');
  });
});
