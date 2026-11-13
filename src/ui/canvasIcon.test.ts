import { describe, expect, it } from 'vitest';
import { iconPaths } from './canvasIcon';
import { ANTENNA_ICON, ROUTER_ICON } from './icons';

describe('iconPaths', () => {
  it('convierte el rectángulo redondeado y los trazos del router', () => {
    const paths = iconPaths(ROUTER_ICON);
    // Un rectángulo (la caja) y cinco trazos: dos luces, la antena y dos ondas.
    expect(paths).toHaveLength(6);
    expect(paths[0]).toBe('M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-4a2 2 0 0 1 2 -2z');
    expect(paths[3]).toBe('M15 10v4');
  });

  it('convierte círculos y líneas', () => {
    expect(iconPaths('<svg><circle cx="12" cy="9" r="2" /><line x1="1" y1="2" x2="3" y2="4"/></svg>')).toEqual([
      'M10 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0z',
      'M1 2L3 4',
    ]);
  });

  it('lee todos los trazos de la antena', () => {
    expect(iconPaths(ANTENNA_ICON)).toHaveLength(6);
  });
});
