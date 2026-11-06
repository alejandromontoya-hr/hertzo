import { describe, expect, it } from 'vitest';
import { LORA_SNR_LIMIT_DB, loraSensitivityDbm, loraTimeOnAirMs, maxSpreadingFactorForDwell, minimumSpreadingFactor } from './lora';

// Sensibilidad = −174 dBm/Hz + 10·log10(BW en Hz) + figura de ruido + SNR límite del SF.
// Con 125 kHz: 10·log10(125 000) = 50,9691 dB; con 500 kHz: 56,9897 dB.

describe('LORA_SNR_LIMIT_DB', () => {
  it('baja 2,5 dB por cada SF: SF7 −7,5 dB … SF12 −20 dB (Semtech SX1276)', () => {
    expect([7, 8, 9, 10, 11, 12].map((sf) => LORA_SNR_LIMIT_DB[sf as 7])).toEqual([-7.5, -10, -12.5, -15, -17.5, -20]);
  });
});

describe('loraSensitivityDbm', () => {
  it('SF12, 125 kHz, NF 6 dB: −174 + 50,9691 + 6 − 20 = −137,03 dBm', () => {
    expect(loraSensitivityDbm(12, 125)).toBeCloseTo(-137.0309, 4);
  });

  it('SF7, 125 kHz, NF 6 dB: −174 + 50,9691 + 6 − 7,5 = −124,53 dBm', () => {
    expect(loraSensitivityDbm(7, 125)).toBeCloseTo(-124.5309, 4);
  });

  it('SF8, 500 kHz, NF 6 dB: −174 + 56,9897 + 6 − 10 = −121,01 dBm', () => {
    expect(loraSensitivityDbm(8, 500)).toBeCloseTo(-121.0103, 4);
  });

  it('un gateway con NF 3 dB oye 3 dB más débil: SF12 a 125 kHz = −140,03 dBm', () => {
    expect(loraSensitivityDbm(12, 125, 3)).toBeCloseTo(-140.0309, 4);
  });
});

describe('loraTimeOnAirMs', () => {
  // Semtech AN1200.13: Tsím = 2^SF / BW; preámbulo = (8 + 4,25)·Tsím;
  // símbolos de carga = 8 + max(ceil((8·PL − 4·SF + 28 + 16) / (4·(SF − 2·DE)))·(CR + 4), 0).
  it('SF7, 125 kHz, 20 bytes: Tsím 1,024 ms; 12,544 + 43·1,024 = 56,576 ms', () => {
    // (160 − 28 + 28 + 16) / 28 = 6,29 → 7; 7·5 + 8 = 43 símbolos.
    expect(loraTimeOnAirMs({ spreadingFactor: 7, bandwidthKHz: 125, payloadBytes: 20 })).toBeCloseTo(56.576, 6);
  });

  it('SF12, 125 kHz, 20 bytes (optimización activa): Tsím 32,768 ms; 401,408 + 28·32,768 = 1318,912 ms', () => {
    // (160 − 48 + 28 + 16) / (4·10) = 3,9 → 4; 4·5 + 8 = 28 símbolos.
    expect(loraTimeOnAirMs({ spreadingFactor: 12, bandwidthKHz: 125, payloadBytes: 20 })).toBeCloseTo(1318.912, 6);
  });

  it('SF10, 125 kHz, 20 bytes: Tsím 8,192 ms; 100,352 + 33·8,192 = 370,688 ms', () => {
    // (160 − 40 + 28 + 16) / 40 = 4,1 → 5; 5·5 + 8 = 33 símbolos.
    expect(loraTimeOnAirMs({ spreadingFactor: 10, bandwidthKHz: 125, payloadBytes: 20 })).toBeCloseTo(370.688, 6);
  });

  it('SF8, 500 kHz, 20 bytes: Tsím 0,512 ms; 6,272 + 38·0,512 = 25,728 ms', () => {
    // (160 − 32 + 28 + 16) / 32 = 5,375 → 6; 6·5 + 8 = 38 símbolos.
    expect(loraTimeOnAirMs({ spreadingFactor: 8, bandwidthKHz: 500, payloadBytes: 20 })).toBeCloseTo(25.728, 6);
  });
});

describe('minimumSpreadingFactor', () => {
  it('−120 dBm alcanza SF7 (sensibilidad −124,53 dBm)', () => {
    expect(minimumSpreadingFactor(-120, 125)).toBe(7);
  });

  it('−130 dBm necesita SF10 (SF9 = −129,53 no alcanza; SF10 = −132,03 sí)', () => {
    expect(minimumSpreadingFactor(-130, 125)).toBe(10);
  });

  it('−137 dBm aún alcanza SF12 (−137,03 dBm)', () => {
    expect(minimumSpreadingFactor(-137, 125)).toBe(12);
  });

  it('−138 dBm no alcanza ni con SF12: null', () => {
    expect(minimumSpreadingFactor(-138, 125)).toBeNull();
  });
});

describe('límite de 400 ms (AU915)', () => {
  it('−134 dBm necesita SF11 (SF10 −132,03 no alcanza; SF11 −134,53 sí); si el límite deja hasta SF10, no llega', () => {
    expect(minimumSpreadingFactor(-134, 125)).toBe(11);
    expect(minimumSpreadingFactor(-134, 125, 6, 10)).toBeNull();
  });

  it('24 bytes a 125 kHz: SF10 (370,688 ms) cabe en 400 ms y SF11 (823,296 ms) no', () => {
    // SF11: Tsím 16,384 ms (> 16, optimización activa); (192 − 44 + 44) / 36 = 5,33 → 6; 6·5 + 8 = 38.
    // 12,25·16,384 + 38·16,384 = 823,296 ms.
    expect(loraTimeOnAirMs({ spreadingFactor: 11, bandwidthKHz: 125, payloadBytes: 24 })).toBeCloseTo(823.296, 6);
    expect(maxSpreadingFactorForDwell(125, 24)).toBe(10);
  });

  it('60 bytes ya no caben en SF10: (480 − 40 + 44) / 40 = 12,1 → 13; 73·8,192 + 100,352 = 698,368 ms → SF9', () => {
    expect(loraTimeOnAirMs({ spreadingFactor: 10, bandwidthKHz: 125, payloadBytes: 60 })).toBeCloseTo(698.368, 6);
    expect(maxSpreadingFactorForDwell(125, 60)).toBe(9);
  });
});

describe('minimumSpreadingFactor con margen del ADR', () => {
  // NF 6 dB a 125 kHz: SF7 −124,53 dBm, SF11 −134,53, SF12 −137,03.
  it('−125 dBm sin margen no llega a SF7 (−124,53): SF8', () => {
    expect(minimumSpreadingFactor(-125, 125)).toBe(8);
  });

  it('−125 dBm con 10 dB de margen: SF11 pediría −124,53 y SF12 −127,03 → SF12', () => {
    expect(minimumSpreadingFactor(-125, 125, 6, 12, 10)).toBe(12);
  });

  it('−110 dBm con 10 dB de margen: SF7 pide −114,53 → SF7', () => {
    expect(minimumSpreadingFactor(-110, 125, 6, 12, 10)).toBe(7);
  });

  it('−136 dBm con 10 dB de margen: ninguno deja margen, pero SF12 (−137,03) llega → SF12', () => {
    expect(minimumSpreadingFactor(-136, 125, 6, 12, 10)).toBe(12);
  });

  it('−138 dBm no llega ni con SF12', () => {
    expect(minimumSpreadingFactor(-138, 125, 6, 12, 10)).toBeNull();
  });
});
