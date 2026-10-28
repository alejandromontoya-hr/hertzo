import { describe, expect, it } from 'vitest';
import { PLAN_PRESETS } from './presets';
import { readIndoorProject, type IndoorProject } from './project';

const casa = PLAN_PRESETS.find((p) => p.id === 'casa')!.build();
const project: IndoorProject = { plan: casa, band: '5', thresholds: [-50, -60, -67, -75, -85] };
/** El proyecto como queda al pasar por un archivo .json. */
const roundTrip = (data: unknown) => JSON.parse(JSON.stringify(data)) as Record<string, unknown>;

describe('readIndoorProject', () => {
  it('el plano "Casa" en 5 GHz vuelve igual después de guardarlo', () => {
    expect(readIndoorProject(roundTrip(project))).toEqual(project);
  });

  it('descarta campos que no son del proyecto', () => {
    const extra = roundTrip({ ...project, script: 'alert(1)' });
    expect(readIndoorProject(extra)).not.toHaveProperty('script');
  });

  it('un muro de un material que no existe ("acero") hace que no se abra', () => {
    const bad = roundTrip(project);
    (bad.plan as { walls: { material: string }[] }).walls[0]!.material = 'acero';
    expect(readIndoorProject(bad)).toBeNull();
  });

  it('un access point sin potencia hace que no se abra', () => {
    const bad = roundTrip(project);
    delete (bad.plan as { aps: { powerDbm?: number }[] }).aps[0]!.powerDbm;
    expect(readIndoorProject(bad)).toBeNull();
  });

  it('una banda que no existe (60 GHz) o un plano de 0 m no se abren', () => {
    expect(readIndoorProject({ ...roundTrip(project), band: '60' })).toBeNull();
    expect(readIndoorProject({ ...roundTrip(project), plan: { ...casa, widthM: 0 } })).toBeNull();
  });

  it('con 4 umbrales en vez de 5 no se abre', () => {
    expect(readIndoorProject({ ...roundTrip(project), thresholds: [-50, -60, -67, -75] })).toBeNull();
  });
});
