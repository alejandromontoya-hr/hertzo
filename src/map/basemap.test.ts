import { describe, expect, it } from 'vitest';
import { parseBasemap } from './basemap';

describe('parseBasemap', () => {
  it('"topo" → topo', () => expect(parseBasemap('topo')).toBe('topo'));
  it('"color" → color', () => expect(parseBasemap('color')).toBe('color'));
  it('sin elección guardada → carta', () => expect(parseBasemap(null)).toBe('carta'));
  it('valor viejo o desconocido ("satelite") → carta', () => expect(parseBasemap('satelite')).toBe('carta'));
});
