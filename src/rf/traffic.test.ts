import { describe, expect, it } from 'vitest';
import {
  averageWaitSeconds,
  erlangB,
  erlangC,
  loraCollisionLoss,
  offeredTrafficErlang,
  probabilityWaitLongerThan,
  pureAlohaLoss,
} from './traffic';

describe('offeredTrafficErlang', () => {
  it('20 radios × 6 llamadas/h × 15 s / 3600 = 0,5 erlangs', () => {
    expect(offeredTrafficErlang(20, 6, 15)).toBeCloseTo(0.5, 12);
  });
});

describe('erlangB', () => {
  it('1 canal, 0,5 Erl: 0,5 / 1,5 = 0,3333', () => {
    expect(erlangB(1, 0.5)).toBeCloseTo(1 / 3, 10);
  });

  it('2 canales, 0,5 Erl: (0,25/2) / (1 + 0,5 + 0,125) = 0,076923', () => {
    expect(erlangB(2, 0.5)).toBeCloseTo(0.076923, 6);
  });

  it('5 canales, 2 Erl: (32/120) / 7,266667 = 0,036697', () => {
    expect(erlangB(5, 2)).toBeCloseTo(0.036697, 6);
  });
});

describe('erlangC (llamadas que esperan canal)', () => {
  it('1 canal: espera la mitad de las llamadas con 0,5 Erl (con un canal, C = A)', () => {
    expect(erlangC(1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it('2 canales, 0,5 Erl: 2·0,076923 / (2 − 0,5·0,923077) = 0,1', () => {
    expect(erlangC(2, 0.5)).toBeCloseTo(0.1, 10);
  });

  it('5 canales, 2 Erl: 5·0,036697 / (5 − 2·0,963303) = 0,059701', () => {
    expect(erlangC(5, 2)).toBeCloseTo(0.059701, 6);
  });

  it('tráfico igual o mayor que los canales: espera todo el mundo (1)', () => {
    expect(erlangC(2, 2)).toBe(1);
    expect(erlangC(2, 3.5)).toBe(1);
  });
});

describe('averageWaitSeconds (promedio de todas las llamadas)', () => {
  it('2 canales, 0,5 Erl, 15 s: 0,1 · 15 / 1,5 = 1 s', () => {
    expect(averageWaitSeconds(2, 0.5, 15)).toBeCloseTo(1, 10);
  });

  it('1 canal, 0,5 Erl, 15 s: 0,5 · 15 / 0,5 = 15 s', () => {
    expect(averageWaitSeconds(1, 0.5, 15)).toBeCloseTo(15, 10);
  });

  it('sistema saturado: espera sin límite', () => {
    expect(averageWaitSeconds(2, 2, 15)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('probabilityWaitLongerThan', () => {
  it('2 canales, 0,5 Erl, 15 s: más de 5 s espera 0,1·e^(−1,5·5/15) = 0,060653', () => {
    expect(probabilityWaitLongerThan(2, 0.5, 15, 5)).toBeCloseTo(0.060653, 6);
  });

  it('esperar más de 0 s es lo mismo que esperar: 0,1', () => {
    expect(probabilityWaitLongerThan(2, 0.5, 15, 0)).toBeCloseTo(0.1, 10);
  });
});

describe('pureAlohaLoss', () => {
  it('carga 0,0514844: 1 − e^(−0,1029689) = 0,097847', () => {
    expect(pureAlohaLoss(0.0514844)).toBeCloseTo(0.097847, 5);
  });

  it('sin carga no se pierde nada', () => {
    expect(pureAlohaLoss(0)).toBe(0);
  });
});

describe('loraCollisionLoss', () => {
  // SF10 a 125 kHz con 24 bytes: 370,688 ms en el aire. Cada 15 min (900 s), 8 canales.
  const sf10 = { spreadingFactor: 10 as const, timeOnAirMs: 370.688 };

  it('30 medidores en SF10: carga 30·0,370688/(900·8) = 0,0015445; se pierde el 0,308 %', () => {
    const r = loraCollisionLoss(Array(30).fill(sf10), 900, 8);
    expect(r.bySf.get(10)!.load).toBeCloseTo(0.00154453, 8);
    expect(r.overallLoss).toBeCloseTo(0.0030843, 6);
  });

  it('1000 medidores en SF10: carga 0,0514844; se pierde el 9,78 %', () => {
    expect(loraCollisionLoss(Array(1000).fill(sf10), 900, 8).overallLoss).toBeCloseTo(0.097847, 5);
  });

  it('SF distintos no chocan entre sí: 1000 en SF10 más 1000 en SF7 pierden lo mismo que cada grupo solo', () => {
    const sf7 = { spreadingFactor: 7 as const, timeOnAirMs: 61.696 };
    const r = loraCollisionLoss([...Array(1000).fill(sf10), ...Array(1000).fill(sf7)], 900, 8);
    const loss7 = 1 - Math.exp((-2 * 1000 * 0.061696) / 7200);
    expect(r.bySf.get(7)!.loss).toBeCloseTo(loss7, 10);
    expect(r.bySf.get(10)!.loss).toBeCloseTo(0.097847, 5);
    // Promedio por mensaje: mitad y mitad.
    expect(r.overallLoss).toBeCloseTo((loss7 + 0.097847) / 2, 5);
  });

  it('sin medidores: nada que perder', () => {
    expect(loraCollisionLoss([], 900, 8).overallLoss).toBe(0);
  });
});
