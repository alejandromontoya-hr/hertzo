import { describe, expect, it } from 'vitest';
import { formatDb, formatDbi, formatDbm, formatLonLat, formatMeters, formatWatts } from './format';

describe('formatos de RF', () => {
  it('dBm con un decimal y signo menos simple: −105,1 → "-105,1 dBm"', () => {
    expect(formatDbm(-105.1)).toBe('-105,1 dBm');
    expect(formatDbm(50)).toBe('50,0 dBm');
  });

  it('dB con un decimal: 5,4 → "5,4 dB"', () => {
    expect(formatDb(5.4)).toBe('5,4 dB');
  });

  it('dBi con hasta dos decimales: 8,15 → "8,15 dBi"; −0,85 → "-0,85 dBi"', () => {
    expect(formatDbi(8.15)).toBe('8,15 dBi');
    expect(formatDbi(-0.85)).toBe('-0,85 dBi');
  });

  it('vatios sin decimales sobrantes: 100 → "100 W"; 0,5 → "0,5 W"', () => {
    expect(formatWatts(100)).toBe('100 W');
    expect(formatWatts(0.5)).toBe('0,5 W');
  });
});

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
