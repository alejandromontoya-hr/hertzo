import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { PLAN_PRESETS } from '../../indoor/presets';
import type { IndoorProject } from '../../indoor/project';
import { indoorShareData, readIndoorShare } from './indoorShare';

const casa = PLAN_PRESETS.find((p) => p.id === 'casa')!.build();
const project: IndoorProject = {
  plan: casa,
  band: '5',
  thresholds: [-50, -60, -67, -75, -85],
  clientPowerDbm: { '2.4': 15, '5': 13, '6': 10 },
  channelWidthMHz: { '2.4': 20, '5': 80, '6': 160 },
};

describe('enlace de /interiores', () => {
  it('el plano "Casa" en 5 GHz sale del enlace igual que entró', async () => {
    const decoded = await decodeShare(await encodeShare(indoorShareData(project)));
    expect(decoded.ok && readIndoorShare(decoded.data)).toEqual(project);
  });

  it('un AP arrastrado a 3,4567891 m queda en 3,46 m: al centímetro', () => {
    const moved = { ...project, plan: { ...casa, aps: [{ ...casa.aps[0]!, x: 3.4567891, y: 2.0049 }] } };
    const shared = indoorShareData(moved).p as IndoorProject;
    expect(shared.plan.aps[0]).toMatchObject({ x: 3.46, y: 2 });
  });

  it('el plano "Casa" cabe en menos de 800 caracteres', async () => {
    expect((await encodeShare(indoorShareData(project))).length).toBeLessThan(800);
  });

  it('un muro de un material que no existe hace que no se abra', () => {
    const data = JSON.parse(JSON.stringify(indoorShareData(project))) as { p: { plan: { walls: { material: string }[] } } };
    data.p.plan.walls[0]!.material = 'acero';
    expect(readIndoorShare(data)).toBeNull();
    expect(readIndoorShare({})).toBeNull();
  });
});
