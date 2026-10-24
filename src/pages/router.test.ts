import { describe, expect, it } from 'vitest';
import { parseLocation } from './router';

describe('parseLocation', () => {
  it('"/terreno" con "?banda=uhf" → página terreno, banda uhf', () => {
    const { path, params } = parseLocation('/terreno', '?banda=uhf');
    expect(path).toBe('terreno');
    expect(params.get('banda')).toBe('uhf');
  });

  it('tolera barra final: "/cavernas/" → cavernas', () => {
    expect(parseLocation('/cavernas/', '').path).toBe('cavernas');
  });

  it('solo cuenta el primer tramo: "/interiores/index.html" → interiores', () => {
    expect(parseLocation('/interiores/index.html', '').path).toBe('interiores');
  });

  it('la raíz no es ninguna simulación', () => {
    expect(parseLocation('/', '').path).toBe('');
  });
});
