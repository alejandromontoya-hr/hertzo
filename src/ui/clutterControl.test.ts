import { describe, expect, it } from 'vitest';
import { DEFAULT_CLUTTER, clutterLabel, clutterQuery, clutterSummary, parseClutter } from './clutterControl';

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

describe('entorno por omisión (Terreno y LoRa)', () => {
  it('sin parámetro: urbano de 15 m; con "ninguno": solo relieve', () => {
    expect(parseClutter(new URLSearchParams(''), DEFAULT_CLUTTER)).toEqual({ type: 'urbano', heightM: 15 });
    expect(parseClutter(new URLSearchParams('entorno=ninguno'), DEFAULT_CLUTTER)).toBeNull();
    expect(parseClutter(new URLSearchParams('entorno=abierto'), DEFAULT_CLUTTER)).toEqual({ type: 'abierto', heightM: 10 });
  });

  it('la dirección queda limpia con el de omisión y dice "ninguno" si se quita', () => {
    expect(clutterQuery({ type: 'urbano', heightM: 15 }, DEFAULT_CLUTTER)).toEqual({ entorno: null, altura: null });
    expect(clutterQuery(null, DEFAULT_CLUTTER)).toEqual({ entorno: 'ninguno', altura: null });
    expect(clutterQuery({ type: 'urbano', heightM: 6 }, DEFAULT_CLUTTER)).toEqual({ entorno: 'urbano', altura: '6' });
    // De ida y vuelta: lo que se escribe en la dirección se vuelve a leer igual.
    for (const c of [null, { type: 'abierto' as const, heightM: 10 }, { type: 'urbano' as const, heightM: 6 }]) {
      const q = clutterQuery(c, DEFAULT_CLUTTER);
      const params = new URLSearchParams();
      if (q.entorno) params.set('entorno', q.entorno);
      if (q.altura) params.set('altura-entorno', q.altura);
      expect(parseClutter(params, DEFAULT_CLUTTER)).toEqual(c);
    }
  });
});
