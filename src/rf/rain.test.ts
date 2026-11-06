import { describe, expect, it } from 'vitest';
import {
  rainAttenuation001Db,
  rainAttenuationDb,
  rainCoefficients,
  rainOutagePercent,
  rainPathFactor,
  rainSpecificAttenuationDbPerKm,
} from './rain';

describe('ITU-R P.838-3: coeficientes k y α', () => {
  it('18 GHz vertical: k = 0,07708 y α = 1,0025', () => {
    const { k, alpha } = rainCoefficients(18000, 'vertical');
    expect(k).toBeCloseTo(0.07708, 4);
    expect(alpha).toBeCloseTo(1.0025, 3);
  });

  it('23 GHz vertical: k = 0,1284 y α = 0,963', () => {
    const { k, alpha } = rainCoefficients(23000, 'vertical');
    expect(k).toBeCloseTo(0.1284, 3);
    expect(alpha).toBeCloseTo(0.963, 3);
  });

  it('la polarización horizontal atenúa más que la vertical (gotas achatadas)', () => {
    expect(rainSpecificAttenuationDbPerKm(18000, 95, 'horizontal')).toBeGreaterThan(rainSpecificAttenuationDbPerKm(18000, 95, 'vertical'));
  });
});

describe('ITU-R P.530-18: 18 GHz vertical, 10 km, R0,01 = 95 mm/h', () => {
  // γR = 0,07708·95^1,0025 = 0,07708·96,088 = 7,406 dB/km.
  it('γR = 7,41 dB/km', () => {
    expect(rainSpecificAttenuationDbPerKm(18000, 95, 'vertical')).toBeCloseTo(7.406, 2);
  });

  // 0,477·10^0,633·95^(0,073·1,0025)·18^0,123 = 0,477·4,2954·1,3955·1,4269 = 4,0799;
  // 10,579·(1 − e^(−0,24)) = 2,2573; r = 1 / (4,0799 − 2,2573) = 0,5487.
  it('r = 0,549', () => {
    expect(rainPathFactor(18000, 10, 95, 'vertical')).toBeCloseTo(0.5487, 3);
  });

  // A0,01 = 7,406·10·0,5487 = 40,64 dB.
  it('A0,01 = 40,6 dB', () => {
    expect(rainAttenuation001Db(18000, 10, 95, 'vertical')).toBeCloseTo(40.64, 1);
  });

  // Al 0,01 %: 0,07·0,01^−(0,855 − 0,278) = 0,07·10^1,154 = 0,998: la fórmula devuelve A0,01.
  it('A al 0,01 % ≈ A0,01', () => {
    expect(rainAttenuationDb(40.64, 0.01)).toBeCloseTo(40.64 * 0.998, 1);
  });

  // Margen de 30 dB: y = log(30 / (0,07·40,64)) = 1,0231; 0,139·L² + 0,855·L + 1,0231 = 0 →
  // L = (−0,855 + √(0,731025 − 0,568855)) / 0,278 = −1,6270 → p = 0,0236 % = 124 min al año.
  it('con 30 dB de margen la lluvia corta el 0,0236 % del año (124 min)', () => {
    const a001 = rainAttenuation001Db(18000, 10, 95, 'vertical');
    const outage = rainOutagePercent(a001, 30);
    expect(outage.bound).toBeNull();
    expect(outage.percent).toBeCloseTo(0.0236, 3);
    expect((outage.percent / 100) * 525960).toBeCloseTo(124, -1);
    expect(rainAttenuationDb(a001, outage.percent)).toBeCloseTo(30, 6);
  });

  it('fuera de 0,001–1 % se acota y se marca', () => {
    expect(rainOutagePercent(40.64, 200)).toEqual({ percent: 0.001, bound: 'below' });
    expect(rainOutagePercent(40.64, 1)).toEqual({ percent: 1, bound: 'above' });
  });
});
