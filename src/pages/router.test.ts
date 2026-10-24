import { describe, expect, it } from 'vitest';
import { parseHash } from './router';

describe('parseHash', () => {
  it('"#/terreno?banda=uhf" → página terreno, banda uhf', () => {
    const { path, params } = parseHash('#/terreno?banda=uhf');
    expect(path).toBe('terreno');
    expect(params.get('banda')).toBe('uhf');
  });

  it('sin hash es la portada', () => {
    expect(parseHash('').path).toBe('');
    expect(parseHash('#/').path).toBe('');
  });

  it('tolera barra final: "#/cavernas/" → cavernas', () => {
    expect(parseHash('#/cavernas/').path).toBe('cavernas');
  });
});
