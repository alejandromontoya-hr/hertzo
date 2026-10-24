import { describe, expect, it } from 'vitest';
import { balanceClass, hexToRgb, isLowConfidence, levelBand, levelBandLabels } from './colorScale';

const thresholds = [-80, -95, -105];

describe('levelBand (sensibilidad del portátil −116 dBm)', () => {
  it('−70 dBm: franja 0 (≥ −80)', () => expect(levelBand(-70, -116, thresholds)).toBe(0));
  it('−80 dBm exacto: franja 0', () => expect(levelBand(-80, -116, thresholds)).toBe(0));
  it('−90 dBm: franja 1 (−95 a −80)', () => expect(levelBand(-90, -116, thresholds)).toBe(1));
  it('−100 dBm: franja 2 (−105 a −95)', () => expect(levelBand(-100, -116, thresholds)).toBe(2));
  it('−110 dBm: franja 3 (−116 a −105)', () => expect(levelBand(-110, -116, thresholds)).toBe(3));
  it('−117 dBm: no llega (−1)', () => expect(levelBand(-117, -116, thresholds)).toBe(-1));
  it('NaN (el motor no calculó): no se pinta', () => expect(levelBand(Number.NaN, -116, thresholds)).toBe(-1));
  it('el orden en que se escriben los umbrales no importa', () => {
    expect(levelBand(-90, -116, [-105, -80, -95])).toBe(1);
  });
});

describe('levelBandLabels', () => {
  it('4 franjas para la leyenda de bajada', () => {
    expect(levelBandLabels(-116, thresholds)).toEqual([
      '≥ -80 dBm',
      '-95 a -80 dBm',
      '-105 a -95 dBm',
      '-116 a -105 dBm',
    ]);
  });
});

describe('balanceClass', () => {
  it('+10,9 dB de bajada y +2 dB de subida: llegan ambas', () => expect(balanceClass(10.9, 2)).toBe('both'));
  it('+10,9 dB de bajada y −1,3 dB de subida: solo bajada', () => expect(balanceClass(10.9, -1.3)).toBe('talkOutOnly'));
  it('−3 dB de bajada y +4 dB de subida: solo subida', () => expect(balanceClass(-3, 4)).toBe('talkInOnly'));
  it('ambas negativas: ninguna', () => expect(balanceClass(-3, -1)).toBe('none'));
  it('margen 0 dB cuenta como que llega', () => expect(balanceClass(0, 0)).toBe('both'));
});

describe('isLowConfidence', () => {
  it('0x0080 (ángulo grande en el sitio): baja confianza', () => expect(isLowConfidence(0x0080)).toBe(true));
  it('0x0780 incluye 0x0080: baja confianza', () => expect(isLowConfidence(0x0780)).toBe(true));
  it('0x0100 (ángulo grande en el radio) solo: confianza normal', () => expect(isLowConfidence(0x0100)).toBe(false));
});

describe('hexToRgb', () => {
  it('#1a7f37 → 26, 127, 55', () => expect(hexToRgb('#1a7f37')).toEqual([26, 127, 55]));
});
