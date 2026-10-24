import { describe, expect, it } from 'vitest';
import { niceTicks } from './chartScale';

describe('niceTicks', () => {
  it('0 a 1000 m con 5 marcas: cada 200 m', () => {
    expect(niceTicks(0, 1000, 5)).toEqual([0, 200, 400, 600, 800, 1000]);
  });

  it('1234 a 3086 m con 5 marcas: cada 500 m desde 1500', () => {
    expect(niceTicks(1234, 3086, 5)).toEqual([1500, 2000, 2500, 3000]);
  });

  it('0 a 23,4 km con 6 marcas: cada 5 km', () => {
    expect(niceTicks(0, 23.4, 6)).toEqual([0, 5, 10, 15, 20]);
  });

  it('rango vacío: una sola marca', () => {
    expect(niceTicks(1500, 1500, 5)).toEqual([1500]);
  });
});
