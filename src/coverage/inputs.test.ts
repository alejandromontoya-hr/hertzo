import { describe, expect, it } from 'vitest';
import { DEFAULT_RX_CHAIN, DEFAULT_TX_CHAIN, RADIO_PROFILES } from '../data/defaults';
import { sameRequest } from './computeCoverage';
import { TALK_IN, TALK_OUT, lmrCoverageRequest } from './inputs';

const site = { lon: -75.6853, lat: 6.2794 };
const portable = RADIO_PROFILES[0]!; // portátil en la cintura, 1 m
const base = lmrCoverageRequest(site, 50000, DEFAULT_TX_CHAIN, DEFAULT_RX_CHAIN, portable);

describe('lmrCoverageRequest', () => {
  it('bajada a 860 MHz desde 50 m y subida a 815 MHz desde 50 m, ambas hasta el radio a 1 m', () => {
    expect(base.links[TALK_OUT]).toEqual({ siteHeightM: 50, radioHeightM: 1, frequencyMHz: 860 });
    expect(base.links[TALK_IN]).toEqual({ siteHeightM: 50, radioHeightM: 1, frequencyMHz: 815 });
  });

  it('usa el ITM por omisión', () => {
    expect(base.engine).toEqual({ id: 'itm' });
  });
});

describe('sameRequest: cuándo hay que recalcular', () => {
  it('cambiar la potencia de 100 W a 50 W no obliga a recalcular', () => {
    const next = lmrCoverageRequest(site, 50000, { ...DEFAULT_TX_CHAIN, transmitterPowerW: 50 }, DEFAULT_RX_CHAIN, portable);
    expect(sameRequest(base, next)).toBe(true);
  });

  it('cambiar la altura de la antena TX de 50 m a 30 m sí obliga', () => {
    const next = lmrCoverageRequest(site, 50000, { ...DEFAULT_TX_CHAIN, antennaHeightM: 30 }, DEFAULT_RX_CHAIN, portable);
    expect(sameRequest(base, next)).toBe(false);
  });

  it('pasar del portátil en la cintura (1 m) al móvil (1,5 m) sí obliga', () => {
    const next = lmrCoverageRequest(site, 50000, DEFAULT_TX_CHAIN, DEFAULT_RX_CHAIN, RADIO_PROFILES[2]!);
    expect(sameRequest(base, next)).toBe(false);
  });

  it('cambiar el radio de cálculo de 50 a 30 km sí obliga', () => {
    const next = lmrCoverageRequest(site, 30000, DEFAULT_TX_CHAIN, DEFAULT_RX_CHAIN, portable);
    expect(sameRequest(base, next)).toBe(false);
  });

  it('sin cálculo anterior siempre hay que calcular', () => {
    expect(sameRequest(null, base)).toBe(false);
  });
});
