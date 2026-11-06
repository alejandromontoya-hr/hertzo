import { describe, expect, it } from 'vitest';
import { CAVE_PRESETS } from './presets';
import { readCaveProject, type CaveProject } from './project';

// La mina de ejemplo en UHF con ajustes cambiados a mano: rugosidad 15 cm, inclinación 2°,
// polarización horizontal, 18 dB por curva, sensibilidad de −112 dBm en el portátil y −118 dBm
// en el repetidor, y portátil de 33 dBm.
const project: CaveProject = {
  model: CAVE_PRESETS.find((p) => p.id === 'mina')!.build(),
  bandId: 'uhf',
  rockId: 'roca',
  roughnessM: 0.15,
  tiltDeg: 2,
  polarization: 'horizontal',
  corner90Db: 18,
  sensitivityDbm: -112,
  portablePowerDbm: 33,
  siteSensitivityDbm: -118,
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

  it('una banda ("5g") o una roca ("granito") que no existen no se abren', () => {
    expect(readCaveProject({ ...roundTrip(project), bandId: '5g' })).toBeNull();
    expect(readCaveProject({ ...roundTrip(project), rockId: 'granito' })).toBeNull();
  });

  it('una polarización "circular" no se abre', () => {
    expect(readCaveProject({ ...roundTrip(project), polarization: 'circular' })).toBeNull();
  });

  it('un cable sin pérdida de acople no se abre', () => {
    expect(readCaveProject({ ...roundTrip(project), cable: { longitudinalDbPer100m: 3.2 } })).toBeNull();
  });

  it('un archivo anterior, sin inclinación ni subida, se abre con 1°, el portátil UHF de 36 dBm y la sensibilidad del portátil', () => {
    const old = roundTrip(project);
    delete old.tiltDeg;
    delete old.portablePowerDbm;
    delete old.siteSensitivityDbm;
    const read = readCaveProject(old)!;
    expect(read.tiltDeg).toBe(1);
    expect(read.portablePowerDbm).toBe(36);
    expect(read.siteSensitivityDbm).toBe(-112);
  });

  it('en FM (solo recepción) no hay potencia de portátil aunque el archivo la traiga', () => {
    expect(readCaveProject({ ...roundTrip(project), bandId: 'fm' })!.portablePowerDbm).toBeNull();
  });

  it('una inclinación negativa (−1°) no se abre', () => {
    expect(readCaveProject({ ...roundTrip(project), tiltDeg: -1 })).toBeNull();
  });
});
