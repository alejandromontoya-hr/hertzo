import { describe, expect, it } from 'vitest';
import { formatShare, formatWait } from './trunkingCapacity';

describe('formatShare', () => {
  it('0,1 → "10,0 %"; 0,5 → "50,0 %"', () => {
    expect(formatShare(0.1)).toBe('10,0 %');
    expect(formatShare(0.5)).toBe('50,0 %');
  });

  it('0,0002 (alguien espera) → "< 0,1 %", no "0,0 %"', () => {
    expect(formatShare(0.0002)).toBe('< 0,1 %');
  });

  it('0 → "0,0 %"', () => {
    expect(formatShare(0)).toBe('0,0 %');
  });
});

describe('formatWait', () => {
  it('1 s → "1,0 s"; sistema saturado → "sin límite"', () => {
    expect(formatWait(1)).toBe('1,0 s');
    expect(formatWait(Number.POSITIVE_INFINITY)).toBe('sin límite');
  });

  it('0,02 s (alguien espera un poco) → "< 0,1 s"; 0 → "0,0 s"', () => {
    expect(formatWait(0.02)).toBe('< 0,1 s');
    expect(formatWait(0)).toBe('0,0 s');
  });
});
