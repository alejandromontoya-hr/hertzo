import { describe, expect, it } from 'vitest';
import { lossPhrase } from './loraCapacity';

describe('lossPhrase', () => {
  it('0,0978 → "el 9,8 %"', () => {
    expect(lossPhrase(0.097847)).toBe('el <strong>9,8 %</strong>');
  });

  it('0,0001 → "menos del 0,1 %", no "el < 0,1 %"', () => {
    expect(lossPhrase(0.0001)).toBe('menos del <strong>0,1 %</strong>');
  });
});
