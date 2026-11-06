import { describe, expect, it } from 'vitest';
import { formatLoss, lossPhrase } from './loraCapacity';

// 20 medidores en SF7 (61,7 ms en el aire) en 8 canales:
// cada 15 min, G = 20 × 0,0617 / 900 / 8 = 1,7139e-4 y la pérdida es 1 − e^(−2G) = 3,4272e-4;
// cada 1.440 min, G = 20 × 0,0617 / 86.400 / 8 = 1,7853e-6 y la pérdida es 3,5706e-6.

describe('formatLoss', () => {
  it('desde 0,05 %, con un decimal: 0,0978 → "9,8 %"', () => {
    expect(formatLoss(0.097847)).toBe('9,8 %');
  });

  it('20 medidores cada 15 min: 3,4272e-4 → "0,034 %", no "< 0,1 %"', () => {
    expect(formatLoss(3.4272e-4)).toBe('0,034 %');
  });

  it('cada 1.440 min también se distingue: 3,5706e-6 → "0,00036 %"', () => {
    expect(formatLoss(3.5706e-6)).toBe('0,00036 %');
  });

  it('sin choques: 0 → "0 %"', () => {
    expect(formatLoss(0)).toBe('0 %');
  });
});

describe('lossPhrase', () => {
  it('0,0978 → "el 9,8 % (1 de cada 10)"', () => {
    expect(lossPhrase(0.097847)).toBe('el <strong>9,8 %</strong> (1 de cada 10)');
  });

  it('3,4272e-4 → 1 / 3,4272e-4 = 2.918 mensajes, con dos cifras "1 de cada 2.900"', () => {
    expect(lossPhrase(3.4272e-4)).toBe('el <strong>0,034 %</strong> (1 de cada 2.900)');
  });

  it('sin pérdida no dice "1 de cada"', () => {
    expect(lossPhrase(0)).toBe('el <strong>0 %</strong>');
  });
});
