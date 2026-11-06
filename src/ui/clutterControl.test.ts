import { describe, expect, it } from 'vitest';
import { clutterLabel, clutterQuery, clutterSummary, parseClutter, parseRequiredClutter } from './clutterControl';

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

describe('clutterSummary', () => {
  const links = [
    { siteHeightM: 30, radioHeightM: 2, frequencyMHz: 923.3 },
    { siteHeightM: 30, radioHeightM: 2, frequencyMHz: 916.8 },
  ];
  const site = { lon: -75.5795, lat: 6.2675 };

  it('con entorno urbano de 15 m, en subida (916,8 MHz): el sitio a 30 m no suma y el sensor a 2 m suma 22,35 dB', () => {
    expect(clutterSummary({ site, radiusM: 8000, links, engine: { id: 'itm', clutter: { type: 'urbano', heightM: 15 } } })).toBe(
      'Entorno urbano o arbolado, 15 m: +22,3 dB',
    );
  });

  it('sin entorno no dice nada', () => {
    expect(clutterSummary({ site, radiusM: 8000, links, engine: { id: 'itm' } })).toBeNull();
  });
});

describe('entorno que hay que elegir (Terreno y LoRa)', () => {
  it('sin parámetro: sin elegir; "ninguno": solo relieve; "urbano": urbano de 15 m', () => {
    expect(parseRequiredClutter(new URLSearchParams(''))).toBeUndefined();
    expect(parseRequiredClutter(new URLSearchParams('entorno=selva'))).toBeUndefined();
    expect(parseRequiredClutter(new URLSearchParams('entorno=ninguno'))).toBeNull();
    expect(parseRequiredClutter(new URLSearchParams('entorno=urbano'))).toEqual({ type: 'urbano', heightM: 15 });
    expect(parseRequiredClutter(new URLSearchParams('entorno=urbano&altura-entorno=6'))).toEqual({ type: 'urbano', heightM: 6 });
  });

  it('"Sin entorno" elegido queda en la dirección como "ninguno" y se vuelve a leer igual', () => {
    expect(clutterQuery(null, true)).toEqual({ entorno: 'ninguno', altura: null });
    for (const c of [null, { type: 'abierto' as const, heightM: 10 }, { type: 'urbano' as const, heightM: 6 }]) {
      const q = clutterQuery(c, true);
      const params = new URLSearchParams();
      if (q.entorno) params.set('entorno', q.entorno);
      if (q.altura) params.set('altura-entorno', q.altura);
      expect(parseRequiredClutter(params)).toEqual(c);
    }
  });
});
