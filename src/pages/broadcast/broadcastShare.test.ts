import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { DEFAULT_AM, DEFAULT_FM, SERVICE } from './broadcastFields';
import { broadcastShareData, readBroadcastShare, type BroadcastShare } from './broadcastShare';

/** La página recién abierta en el servicio dado, sin tocar nada. */
const fresh = (service: 'fm' | 'am'): BroadcastShare => ({
  site: null,
  name: '',
  radiusKm: SERVICE[service].radiusKm,
  thresholds: [...SERVICE[service].thresholds],
  fm: { ...DEFAULT_FM },
  am: { ...DEFAULT_AM },
  amAntennaId: 'cuarto',
  groundId: 'media',
});

describe('broadcastShareData', () => {
  it('sin cambios no lleva nada, en FM (60 km) y en AM (150 km)', () => {
    expect(broadcastShareData(fresh('fm'), 'fm')).toEqual({});
    expect(broadcastShareData(fresh('am'), 'am')).toEqual({});
  });

  it('lleva solo lo que cambió: 101,9 MHz y 5 kW de ERP', () => {
    const state = { ...fresh('fm'), fm: { ...DEFAULT_FM, frequencyMHz: 101.9, erpKw: 5 } };
    expect(broadcastShareData(state, 'fm')).toEqual({ f: { frequencyMHz: 101.9, erpKw: 5 } });
  });
});

describe('readBroadcastShare', () => {
  it('lo que sale del enlace es lo que había en la página: una AM en 750 kHz sobre tierra húmeda', async () => {
    const state: BroadcastShare = {
      ...fresh('am'),
      site: { lat: 4.6097, lon: -74.0817 },
      name: 'Emisora Bogotá',
      radiusKm: 200,
      thresholds: [66, 60, 54, 48],
      am: { frequencyKHz: 750, powerKw: 50 },
      amAntennaId: 'corto',
      groundId: 'humeda',
    };
    const decoded = await decodeShare(await encodeShare(broadcastShareData(state, 'am')));
    expect(decoded.ok && readBroadcastShare(decoded.data, 'am')).toEqual(state);
  });

  it('un enlace vacío abre la página como siempre', () => {
    expect(readBroadcastShare({ v: 1 }, 'am')).toEqual(fresh('am'));
  });

  it('un valor imposible no abre nada a medias', () => {
    expect(readBroadcastShare({ f: { frequencyMHz: 120 } }, 'fm')).toBeNull(); // FM llega a 108 MHz
    expect(readBroadcastShare({ am: { frequencyKHz: 2000 } }, 'am')).toBeNull(); // AM llega a 1710 kHz
    expect(readBroadcastShare({ an: 'dipolo' }, 'am')).toBeNull();
    expect(readBroadcastShare({ g: 'arena' }, 'am')).toBeNull();
    expect(readBroadcastShare({ u: [150, 66, 54, 48] }, 'fm')).toBeNull(); // umbrales hasta 140 dBµV/m
    expect(readBroadcastShare({ r: 400 }, 'am')).toBeNull(); // radio hasta 300 km
  });
});
