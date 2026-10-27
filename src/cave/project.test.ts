import { describe, expect, it } from 'vitest';
import { CAVE_PRESETS } from './presets';
import { readCaveProject, type CaveProject } from './project';

// La mina de ejemplo en UHF con ajustes cambiados a mano: rugosidad 15 cm, polarización
// horizontal, 18 dB por curva y sensibilidad de −112 dBm.
const project: CaveProject = {
  model: CAVE_PRESETS.find((p) => p.id === 'mina')!.build(),
  bandId: 'uhf',
  rockId: 'roca',
  roughnessM: 0.15,
  polarization: 'horizontal',
  corner90Db: 18,
  sensitivityDbm: -112,
  cable: { longitudinalDbPer100m: 3.2, couplingLossDb: 70 },
  thresholds: [-82, -92, -102, -112],
};
const roundTrip = (data: unknown) => JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

describe('readCaveProject', () => {
  it('la mina con todos sus ajustes vuelve igual después de guardarla', () => {
    expect(readCaveProject(roundTrip(project))).toEqual(project);
  });

  it('una galería de un solo punto hace que no se abra', () => {
    const bad = roundTrip(project);
    const galleries = (bad.model as { galleries: { points: unknown[] }[] }).galleries;
    galleries[0]!.points = galleries[0]!.points.slice(0, 1);
    expect(readCaveProject(bad)).toBeNull();
  });

  it('una banda («5g») o una roca («granito») que no existen no se abren', () => {
    expect(readCaveProject({ ...roundTrip(project), bandId: '5g' })).toBeNull();
    expect(readCaveProject({ ...roundTrip(project), rockId: 'granito' })).toBeNull();
  });

  it('una polarización «circular» no se abre', () => {
    expect(readCaveProject({ ...roundTrip(project), polarization: 'circular' })).toBeNull();
  });

  it('un cable sin pérdida de acople no se abre', () => {
    expect(readCaveProject({ ...roundTrip(project), cable: { longitudinalDbPer100m: 3.2 } })).toBeNull();
  });
});
