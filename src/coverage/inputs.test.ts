import { describe, expect, it } from 'vitest';
import { DEFAULT_RX_CHAIN, DEFAULT_TX_CHAIN, RADIO_PROFILES } from '../data/defaults';
import { propagationInputs, sameInputs } from './inputs';

const site = { lon: -75.6853, lat: 6.2794 };
const portable = RADIO_PROFILES[0]!; // portátil en la cintura, 1 m
const base = propagationInputs(site, 50000, DEFAULT_TX_CHAIN, DEFAULT_RX_CHAIN, portable);

describe('propagationInputs', () => {
  it('bajada a 860 MHz desde 50 m y subida a 815 MHz desde 50 m, ambas hasta el radio a 1 m', () => {
    expect(base.talkOut).toEqual({ siteHeightM: 50, radioHeightM: 1, frequencyMHz: 860 });
    expect(base.talkIn).toEqual({ siteHeightM: 50, radioHeightM: 1, frequencyMHz: 815 });
  });
});

describe('sameInputs: cuándo hay que recalcular', () => {
  it('cambiar la potencia de 100 W a 50 W no obliga a recalcular', () => {
    const next = propagationInputs(site, 50000, { ...DEFAULT_TX_CHAIN, transmitterPowerW: 50 }, DEFAULT_RX_CHAIN, portable);
    expect(sameInputs(base, next)).toBe(true);
  });

  it('cambiar la altura de la antena TX de 50 m a 30 m sí obliga', () => {
    const next = propagationInputs(site, 50000, { ...DEFAULT_TX_CHAIN, antennaHeightM: 30 }, DEFAULT_RX_CHAIN, portable);
    expect(sameInputs(base, next)).toBe(false);
  });

  it('pasar del portátil en la cintura (1 m) al móvil (1,5 m) sí obliga', () => {
    const next = propagationInputs(site, 50000, DEFAULT_TX_CHAIN, DEFAULT_RX_CHAIN, RADIO_PROFILES[2]!);
    expect(sameInputs(base, next)).toBe(false);
  });

  it('del portátil en la cintura al de la cara cambia la altura (1 → 1,5 m): obliga', () => {
    const next = propagationInputs(site, 50000, DEFAULT_TX_CHAIN, DEFAULT_RX_CHAIN, RADIO_PROFILES[1]!);
    expect(sameInputs(base, next)).toBe(false);
  });

  it('sin cálculo anterior siempre hay que calcular', () => {
    expect(sameInputs(null, base)).toBe(false);
  });
});
