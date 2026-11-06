import { describe, expect, it } from 'vitest';
import { clutterLossDb, knifeEdgeLossDb, pathHeightM } from './clutter';

// UIT-R P.2108-1, sección 3.1, a 916,8 MHz (f = 0,9168 GHz): Knu = 0,342·√0,9168 = 0,32746.

describe('knifeEdgeLossDb, ec. (1)', () => {
  it('J(0) = 6,9 + 20·log(√1,01 − 0,1) = 6,03 dB: por eso la ec. (2a) le resta 6,03', () => {
    expect(knifeEdgeLossDb(0)).toBeCloseTo(6.0329, 4);
  });

  it('vale 0 para ν ≤ −0,78', () => {
    expect(knifeEdgeLossDb(-1)).toBe(0);
  });
});

describe('clutterLossDb, equipo a 2 m a 916,8 MHz', () => {
  it('urbano (15 m): Δh = 13, θ = atan(13/27) = 25,71°, ν = 0,32746·√(13·25,71) = 5,987, J = 28,38 → 22,35 dB', () => {
    expect(clutterLossDb(916.8, 2, { type: 'urbano', heightM: 15 })).toBeCloseTo(22.35, 2);
  });

  it('suburbano (10 m), también por difracción: Δh = 8, θ = 16,50°, ν = 3,763 → 18,32 dB', () => {
    expect(clutterLossDb(916.8, 2, { type: 'suburbano', heightM: 10 })).toBeCloseTo(18.324, 2);
  });

  it('urbano denso (20 m): Δh = 18, θ = 33,69°, ν = 8,064 → 24,95 dB', () => {
    expect(clutterLossDb(916.8, 2, { type: 'urbano-denso', heightM: 20 })).toBeCloseTo(24.947, 2);
  });

  it('abierto (10 m), ec. (2b): Kh2 = 21,8 + 6,2·log 0,9168 = 21,566; −21,566·log(2/10) = 15,07 dB', () => {
    expect(clutterLossDb(916.8, 2, { type: 'abierto', heightM: 10 })).toBeCloseTo(15.074, 2);
  });
});

describe('otros casos', () => {
  it('medidor a 0,5 m entre techos de 6 m (la feria): Δh = 5,5, θ = 11,51°, ν = 2,606 → 15,20 dB', () => {
    expect(clutterLossDb(916.8, 0.5, { type: 'urbano', heightM: 6 })).toBeCloseTo(15.197, 2);
  });

  it('portátil a 1 m en UHF 460 MHz, urbano: ν = 4,544 → 19,95 dB', () => {
    expect(clutterLossDb(460, 1, { type: 'urbano', heightM: 15 })).toBeCloseTo(19.953, 2);
  });

  it('antena a la altura del entorno o por encima: no suma', () => {
    expect(clutterLossDb(916.8, 15, { type: 'urbano', heightM: 15 })).toBe(0);
    expect(clutterLossDb(916.8, 30, { type: 'urbano-denso', heightM: 20 })).toBe(0);
  });
});

describe('pathHeightM', () => {
  it('el trayecto se calcula a la altura del entorno si el equipo está por debajo', () => {
    expect(pathHeightM(2, { type: 'urbano', heightM: 15 })).toBe(15);
    expect(pathHeightM(30, { type: 'urbano', heightM: 15 })).toBe(30);
    expect(pathHeightM(2, null)).toBe(2);
  });
});
