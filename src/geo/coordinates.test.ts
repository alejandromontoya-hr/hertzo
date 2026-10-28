import { describe, expect, it } from 'vitest';
import { isLatitude, isLongitude, parseDegrees, parseLatLonPair } from './coordinates';

describe('parseDegrees', () => {
  it('acepta punto o coma decimal: "6.2794" y "6,2794" son 6,2794', () => {
    expect(parseDegrees('6.2794')).toBe(6.2794);
    expect(parseDegrees(' 6,2794 ')).toBe(6.2794);
    expect(parseDegrees('-75.6853')).toBe(-75.6853);
  });

  it('rechaza texto, vacío o dos números', () => {
    expect(parseDegrees('')).toBeNull();
    expect(parseDegrees('norte')).toBeNull();
    expect(parseDegrees('6.27940, -75.68530')).toBeNull();
  });
});

describe('isLatitude / isLongitude', () => {
  it('latitud de −90 a 90 y longitud de −180 a 180', () => {
    expect(isLatitude(6.2794)).toBe(true);
    expect(isLatitude(95)).toBe(false);
    expect(isLongitude(-75.6853)).toBe(true);
    expect(isLongitude(-181)).toBe(false);
  });
});

describe('parseLatLonPair', () => {
  it('lo que copia Google Maps del Padre Amaya: "6.27940, -75.68530"', () => {
    expect(parseLatLonPair('6.27940, -75.68530')).toEqual({ lat: 6.2794, lon: -75.6853 });
  });

  it('también con punto y coma, con espacio o con coma sin espacio si ambos llevan punto', () => {
    expect(parseLatLonPair('6.2794; -75.6853')).toEqual({ lat: 6.2794, lon: -75.6853 });
    expect(parseLatLonPair('6.2794 -75.6853')).toEqual({ lat: 6.2794, lon: -75.6853 });
    expect(parseLatLonPair('6.2794,-75.6853')).toEqual({ lat: 6.2794, lon: -75.6853 });
  });

  it('"6,75" es un número con coma decimal, no el par (6, 75)', () => {
    expect(parseLatLonPair('6,75')).toBeNull();
  });

  it('un par fuera de rango (latitud 95) o con texto no se acepta', () => {
    expect(parseLatLonPair('95.1, -75.6')).toBeNull();
    expect(parseLatLonPair('Medellín, Colombia')).toBeNull();
  });
});
