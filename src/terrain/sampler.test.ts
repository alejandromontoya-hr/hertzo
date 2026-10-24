import { describe, expect, it } from 'vitest';
import { createTerrainSampler, type HeightTile } from './sampler';
import { TERRAIN_TILE_SIZE, tileKey } from './tiles';

/**
 * Mundo de prueba en zoom 1 (4 teselas, 512 × 512 px) donde la altura de cada píxel es
 * su número de columna: 0 m en el borde oeste y 511 m en el borde este.
 */
function columnWorld(): Map<string, HeightTile> {
  const tiles = new Map<string, HeightTile>();
  for (let tx = 0; tx < 2; tx++) {
    for (let ty = 0; ty < 2; ty++) {
      const tile = new Int16Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE);
      for (let row = 0; row < TERRAIN_TILE_SIZE; row++) {
        for (let col = 0; col < TERRAIN_TILE_SIZE; col++) {
          tile[row * TERRAIN_TILE_SIZE + col] = tx * TERRAIN_TILE_SIZE + col;
        }
      }
      tiles.set(tileKey(1, tx, ty), tile);
    }
  }
  return tiles;
}

describe('createTerrainSampler', () => {
  const sampler = createTerrainSampler(columnWorld(), 1);

  it('lon 0° cae en x = 256 px: entre la columna 255 y la 256, que están en teselas distintas → 255,5 m', () => {
    expect(sampler.heightAt(0, 0)).toBeCloseTo(255.5, 6);
  });

  it('lon 90° cae en x = 384 px → 383,5 m', () => {
    expect(sampler.heightAt(90, 20)).toBeCloseTo(383.5, 6);
  });

  it('la altura no cambia con la latitud en este mundo', () => {
    expect(sampler.heightAt(-45, 30)).toBeCloseTo(sampler.heightAt(-45, -30), 6);
  });

  it('avisa si falta una tesela', () => {
    const one = new Map([[tileKey(1, 0, 0), new Int16Array(TERRAIN_TILE_SIZE * TERRAIN_TILE_SIZE)]]);
    expect(() => createTerrainSampler(one, 1).heightAt(90, -20)).toThrow('Falta la tesela de terreno');
  });
});
