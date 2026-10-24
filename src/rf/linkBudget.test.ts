import { describe, expect, it } from 'vitest';
import {
  marginDb,
  receivedPowerDbm,
  talkInBudget,
  talkOutBudget,
  type RadioProfile,
  type SiteRxChain,
  type SiteTxChain,
} from './linkBudget';

// Sitio de ejemplo. Los valores de pérdidas y ganancias son solo para las pruebas; los
// valores por defecto de la app están en src/data/defaults.ts.
const tx: SiteTxChain = {
  frequencyMHz: 860,
  transmitterPowerW: 100, // 50 dBm
  combinerLossDb: 2,
  lineLengthM: 60,
  lineLossDbPer100m: 4, // 2,4 dB
  connectorLossDb: 1,
  antennaGainDbd: 6, // 8,15 dBi
  antennaHeightM: 50,
};

const rx: SiteRxChain = {
  frequencyMHz: 815,
  antennaGainDbd: 6, // 8,15 dBi
  antennaHeightM: 50,
  towerAmplifierGainDb: 0,
  lineLengthM: 60,
  lineLossDbPer100m: 4, // 2,4 dB
  multicouplerLossDb: 3,
  receiverSensitivityDbm: -119,
};

const portable: RadioProfile = {
  id: 'prueba',
  name: 'Portátil de prueba',
  powerW: 3, // 34,7712 dBm
  antennaGainDbd: 0, // 2,15 dBi
  heightM: 1.5,
  bodyLossDb: 10,
  sensitivityDbm: -116,
};

describe('talkOutBudget (bajada: repetidora → radio)', () => {
  const b = talkOutBudget(tx, portable);

  it('usa la frecuencia de la cadena TX (860 MHz)', () => {
    expect(b.direction).toBe('talk-out');
    expect(b.frequencyMHz).toBe(860);
  });

  it('potencia del transmisor: 100 W = 50 dBm', () => {
    expect(b.txPowerDbm).toBeCloseTo(50, 10);
  });

  it('pérdidas del sitio: 2 combinador + 2,4 línea + 1 conectores = 5,4 dB', () => {
    expect(b.txLossesDb).toBeCloseTo(5.4, 10);
  });

  it('ERP = 50 − 5,4 + 6 dBd = 50,6 dBm; PIRE = 50,6 + 2,15 = 52,75 dBm', () => {
    expect(b.erpDbm).toBeCloseTo(50.6, 10);
    expect(b.eirpDbm).toBeCloseTo(52.75, 10);
  });

  it('lado del radio: antena 2,15 dBi y 10 dB de pérdida por el cuerpo', () => {
    expect(b.rxAntennaGainDbi).toBeCloseTo(2.15, 10);
    expect(b.rxLossesDb).toBeCloseTo(10, 10);
    expect(b.sensitivityDbm).toBe(-116);
  });

  it('pérdida de trayecto máxima = 52,75 + 2,15 − 10 + 116 = 160,9 dB', () => {
    expect(b.maxPathLossDb).toBeCloseTo(160.9, 10);
  });

  it('con 150 dB de trayecto llega −105,1 dBm y sobran 10,9 dB', () => {
    expect(receivedPowerDbm(b, 150)).toBeCloseTo(-105.1, 10);
    expect(marginDb(b, 150)).toBeCloseTo(10.9, 10);
  });
});

describe('talkInBudget (subida: radio → repetidora)', () => {
  const b = talkInBudget(rx, portable);

  it('usa la frecuencia de la cadena RX (815 MHz)', () => {
    expect(b.direction).toBe('talk-in');
    expect(b.frequencyMHz).toBe(815);
  });

  it('potencia del portátil: 3 W = 34,7712 dBm', () => {
    expect(b.txPowerDbm).toBeCloseTo(34.7712, 4);
  });

  it('el cuerpo resta del lado del radio: PIRE = 34,7712 + 2,15 − 10 = 26,9212 dBm', () => {
    expect(b.txLossesDb).toBeCloseTo(10, 10);
    expect(b.eirpDbm).toBeCloseTo(26.9212, 4);
    expect(b.erpDbm).toBeCloseTo(24.7712, 4);
  });

  it('lado del sitio: antena 8,15 dBi, pérdidas 2,4 línea + 3 multiacoplador = 5,4 dB', () => {
    expect(b.rxAntennaGainDbi).toBeCloseTo(8.15, 10);
    expect(b.rxGainsDb).toBe(0);
    expect(b.rxLossesDb).toBeCloseTo(5.4, 10);
    expect(b.sensitivityDbm).toBe(-119);
  });

  it('pérdida de trayecto máxima = 26,9212 + 8,15 − 5,4 + 119 = 148,6712 dB', () => {
    expect(b.maxPathLossDb).toBeCloseTo(148.6712, 4);
  });

  it('con 150 dB de trayecto llega −120,3288 dBm: faltan 1,33 dB', () => {
    expect(receivedPowerDbm(b, 150)).toBeCloseTo(-120.3288, 4);
    expect(marginDb(b, 150)).toBeCloseTo(-1.3288, 4);
  });

  it('el amplificador de torre suma su ganancia: con 12 dB llega −108,3288 dBm', () => {
    const withTta = talkInBudget({ ...rx, towerAmplifierGainDb: 12 }, portable);
    expect(withTta.rxGainsDb).toBe(12);
    expect(receivedPowerDbm(withTta, 150)).toBeCloseTo(-108.3288, 4);
  });
});

describe('desbalance entre bajada y subida', () => {
  it('con 150 dB en ambos sentidos: la bajada llega (+10,9 dB) y la subida no (−1,33 dB)', () => {
    expect(marginDb(talkOutBudget(tx, portable), 150)).toBeGreaterThan(0);
    expect(marginDb(talkInBudget(rx, portable), 150)).toBeLessThan(0);
  });
});
