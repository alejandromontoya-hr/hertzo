import { describe, expect, it } from 'vitest';
import { CAVE_PRESETS } from '../../cave/presets';
import type { CaveProject } from '../../cave/project';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { caveShareData, readCaveShare } from './caveShare';

// La mina de ejemplo en UHF con ajustes cambiados a mano, como en las pruebas del proyecto.
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

describe('enlace de /cavernas', () => {
  it('la mina con todos sus ajustes sale del enlace igual que entró (al centímetro)', async () => {
    const data = caveShareData(project);
    const decoded = await decodeShare(await encodeShare(data));
    expect(decoded.ok && readCaveShare(decoded.data)).toEqual(data.p);
  });

  it('una antena arrastrada a 12,3456 m queda en 12,35 m', () => {
    const moved = { ...project, model: { ...project.model, transmitters: [{ ...project.model.transmitters[0]!, x: 12.3456, y: -0.004 }] } };
    const shared = caveShareData(moved).p as CaveProject;
    expect(shared.model.transmitters[0]).toMatchObject({ x: 12.35, y: -0 });
  });

  it('la mina con todos sus ajustes cabe en menos de 800 caracteres (739)', async () => {
    expect((await encodeShare(caveShareData(project))).length).toBeLessThan(800);
  });

  it('una roca que no existe hace que no se abra', () => {
    const data = JSON.parse(JSON.stringify(caveShareData(project))) as { p: { rockId: string } };
    data.p.rockId = 'diamante';
    expect(readCaveShare(data)).toBeNull();
    expect(readCaveShare({})).toBeNull();
  });
});
