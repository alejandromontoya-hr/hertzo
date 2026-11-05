import { describe, expect, it } from 'vitest';
import { talkInBudget, talkOutBudget } from '../rf/linkBudget';
import {
  DEFAULT_LORA_GATEWAY,
  LORA_BANDS,
  LORA_SENSORS,
  gatewayRxChain,
  gatewayTxChain,
  sensorRadioProfile,
} from './lora';

const au915 = LORA_BANDS.find((b) => b.id === 'au915')!;
const poste = LORA_SENSORS.find((s) => s.id === 'poste')!;
const caja = LORA_SENSORS.find((s) => s.id === 'medidor-caja')!;

// Gateway: 0,5 W = 26,9897 dBm; línea 10 m × 12,8 dB/100 m = 1,28 dB; conector 0,5 dB;
// antena 3 dBd = 5,15 dBi. PIRE de bajada = 26,9897 − 1,78 + 5,15 = 30,3597 dBm.

describe('canales AU915 (Colombia)', () => {
  it('sube en 916,8 MHz a 125 kHz y baja en 923,3 MHz a 500 kHz', () => {
    expect(gatewayRxChain(au915, DEFAULT_LORA_GATEWAY).frequencyMHz).toBe(916.8);
    expect(gatewayTxChain(au915, DEFAULT_LORA_GATEWAY).frequencyMHz).toBe(923.3);
  });

  it('el gateway oye SF12 a 125 kHz con NF 4 dB: −174 + 50,9691 + 4 − 20 = −139,03 dBm', () => {
    expect(gatewayRxChain(au915, DEFAULT_LORA_GATEWAY).receiverSensitivityDbm).toBeCloseTo(-139.0309, 4);
  });

  it('el sensor oye SF12 a 500 kHz con NF 6 dB: −174 + 56,9897 + 6 − 20 = −131,01 dBm', () => {
    expect(sensorRadioProfile(au915, poste).sensitivityDbm).toBeCloseTo(-131.0103, 4);
  });
});

describe('sensor en poste, AU915', () => {
  it('bajada: 30,3597 + 2,15 (antena 0 dBd) + 131,0103 = 163,52 dB de pérdida máxima', () => {
    const budget = talkOutBudget(gatewayTxChain(au915, DEFAULT_LORA_GATEWAY), sensorRadioProfile(au915, poste));
    expect(budget.eirpDbm).toBeCloseTo(30.3597, 4);
    expect(budget.maxPathLossDb).toBeCloseTo(163.52, 4);
  });

  it('subida: 20 + 2,15 + 5,15 − 1,78 + 139,0309 = 164,5509 dB; la bajada limita por 1 dB', () => {
    const budget = talkInBudget(gatewayRxChain(au915, DEFAULT_LORA_GATEWAY), sensorRadioProfile(au915, poste));
    expect(budget.eirpDbm).toBeCloseTo(22.15, 4);
    expect(budget.maxPathLossDb).toBeCloseTo(164.5509, 4);
  });
});

describe('medidor en caja, AU915', () => {
  it('subida: 0,025 W = 13,9794 dBm − 15 dB de caja − 0,85 dBi = PIRE −1,8706 dBm; pérdida máxima 140,5303 dB', () => {
    const budget = talkInBudget(gatewayRxChain(au915, DEFAULT_LORA_GATEWAY), sensorRadioProfile(au915, caja));
    expect(budget.eirpDbm).toBeCloseTo(-1.8706, 4);
    expect(budget.maxPathLossDb).toBeCloseTo(140.5303, 4);
  });

  it('bajada: 30,3597 − 0,85 − 15 + 131,0103 = 145,52 dB', () => {
    const budget = talkOutBudget(gatewayTxChain(au915, DEFAULT_LORA_GATEWAY), sensorRadioProfile(au915, caja));
    expect(budget.maxPathLossDb).toBeCloseTo(145.52, 4);
  });

  it('va a 0,5 m, la altura mínima que acepta el ITM', () => {
    expect(caja.heightM).toBe(0.5);
  });
});
