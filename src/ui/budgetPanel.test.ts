import { describe, expect, it } from 'vitest';
import type { LinkBudget } from '../rf/linkBudget';
import { balanceSummary } from './budgetPanel';

function budget(maxPathLossDb: number): LinkBudget {
  return {
    direction: 'talk-out',
    frequencyMHz: 860,
    txPowerDbm: 50,
    txLossesDb: 0,
    txAntennaGainDbi: 0,
    erpDbm: 0,
    eirpDbm: 0,
    rxAntennaGainDbi: 0,
    rxGainsDb: 0,
    rxLossesDb: 0,
    sensitivityDbm: -116,
    maxPathLossDb,
  };
}

describe('balanceSummary', () => {
  it('bajada 160,9 dB y subida 148,7 dB: limita la subida por 12,2 dB', () => {
    expect(balanceSummary(budget(160.9), budget(148.7))).toBe(
      'La subida aguanta 12,2 dB menos de pérdida que la bajada: la cobertura la limita la subida (oyes la repetidora, pero ella no te oye).',
    );
  });

  it('bajada 140 dB y subida 145,5 dB: limita la bajada por 5,5 dB', () => {
    expect(balanceSummary(budget(140), budget(145.5))).toMatch(/^La bajada aguanta 5,5 dB menos/);
  });

  it('diferencia de 0,4 dB: balanceado', () => {
    expect(balanceSummary(budget(150.4), budget(150))).toBe(
      'Bajada y subida están balanceadas (diferencia de 0,4 dB).',
    );
  });
});
