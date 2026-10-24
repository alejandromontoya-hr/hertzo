import { describe, expect, it } from 'vitest';
import { formatLonLat, formatMeters } from './format';

describe('formatMeters', () => {
  it('redondea y separa miles con punto: 3102,4 → "3.102 m"', () => {
    expect(formatMeters(3102.4)).toBe('3.102 m');
  });

  it('valores pequeños sin separador: 85,6 → "86 m"', () => {
    expect(formatMeters(85.6)).toBe('86 m');
  });
});

describe('formatLonLat', () => {
  it('latitud primero, 5 decimales, con punto decimal', () => {
    expect(formatLonLat(-75.6681, 6.2689)).toBe('6.26890, -75.66810');
  });
});
