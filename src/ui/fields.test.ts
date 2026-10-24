import { describe, expect, it } from 'vitest';
import { formatFieldValue, parseFieldValue, type NumberFieldSpec } from './fields';

const power: NumberFieldSpec = { key: 'p', label: 'Potencia', unit: 'W', min: 0, max: 1000, minExclusive: true };
const sensitivity: NumberFieldSpec = { key: 's', label: 'Sensibilidad', unit: 'dBm', min: -150, max: -60 };

describe('parseFieldValue', () => {
  it('acepta coma o punto decimal: "34,8" y "34.8" son 34,8', () => {
    expect(parseFieldValue('34,8', power)).toEqual({ ok: true, value: 34.8 });
    expect(parseFieldValue('34.8', power)).toEqual({ ok: true, value: 34.8 });
  });

  it('acepta negativos y espacios: " -119 " es −119 dBm', () => {
    expect(parseFieldValue(' -119 ', sensitivity)).toEqual({ ok: true, value: -119 });
  });

  it('rechaza el campo vacío', () => {
    expect(parseFieldValue('  ', power)).toEqual({ ok: false, error: 'Escribe un valor.' });
  });

  it('rechaza texto que no es número', () => {
    expect(parseFieldValue('cien', power)).toEqual({ ok: false, error: 'No es un número.' });
  });

  it('0 W no se admite: la potencia debe ser mayor que 0 W', () => {
    expect(parseFieldValue('0', power)).toEqual({ ok: false, error: 'Debe ser mayor que 0 W.' });
  });

  it('fuera de rango: −50 dBm de sensibilidad', () => {
    expect(parseFieldValue('-50', sensitivity)).toEqual({
      ok: false,
      error: 'Debe estar entre -150 y -60 dBm.',
    });
  });
});

describe('formatFieldValue', () => {
  it('coma decimal y sin separador de miles: 3,9 · 1000 · -119', () => {
    expect(formatFieldValue(3.9)).toBe('3,9');
    expect(formatFieldValue(1000)).toBe('1000');
    expect(formatFieldValue(-119)).toBe('-119');
  });
});
