import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { DEFAULT_RAIN_RATE_MM_H } from '../../rf/rain';
import { EXAMPLE_A, EXAMPLE_B, EXAMPLE_NAME_A, EXAMPLE_NAME_B, PRESETS } from './linkFields';
import { linkShareData, readLinkShare, type LinkShare } from './linkShare';

/** La página recién abierta en microondas, con el ejemplo Padre Amaya → El Volador. */
const fresh = (): LinkShare => ({
  endA: EXAMPLE_A,
  endB: EXAMPLE_B,
  nameA: EXAMPLE_NAME_A,
  nameB: EXAMPLE_NAME_B,
  params: { ...PRESETS.microondas.params },
  kFactorId: '1.3333',
  lossModel: 'difraccion',
  terrainId: 'promedio',
  climateId: 'humedo',
  polarization: 'vertical',
  rainRate: DEFAULT_RAIN_RATE_MM_H,
});

describe('linkShareData', () => {
  it('el ejemplo sin cambios no lleva nada', () => {
    expect(linkShareData(fresh(), 'microondas')).toEqual({});
  });

  it('en radio, ITM y 450 MHz son los de siempre: no viajan', () => {
    const radio = { ...fresh(), params: { ...PRESETS.radio.params }, lossModel: 'itm' as const };
    expect(linkShareData(radio, 'radio')).toEqual({});
  });

  it('lleva solo lo que cambió: el extremo B, su nombre, 18 GHz y k = 2/3', () => {
    const state = {
      ...fresh(),
      endB: { lat: 6.2087, lon: -75.5671 },
      nameB: 'Torre El Poblado',
      params: { ...PRESETS.microondas.params, frequencyMHz: 18000 },
      kFactorId: '0.6667',
    };
    expect(linkShareData(state, 'microondas')).toEqual({ b: [6.2087, -75.5671], nb: 'Torre El Poblado', p: { frequencyMHz: 18000 }, k: '0.6667' });
  });

  it('un extremo borrado viaja como null', () => {
    expect(linkShareData({ ...fresh(), endA: null }, 'microondas')).toEqual({ a: null });
  });
});

describe('readLinkShare', () => {
  it('lo que sale del enlace es lo que había en la página', async () => {
    const state: LinkShare = {
      ...fresh(),
      endA: { lat: 6.3, lon: -75.7 },
      nameA: 'Repetidora Las Palmas',
      params: { ...PRESETS.microondas.params, frequencyMHz: 7400, antennaA: 1.2, heightBM: 45, thresholdDbm: -75 },
      terrainId: 'montana',
      climateId: 'seco',
      polarization: 'horizontal',
      rainRate: 120,
    };
    const decoded = await decodeShare(await encodeShare(linkShareData(state, 'microondas')));
    expect(decoded.ok && readLinkShare(decoded.data, 'microondas')).toEqual(state);
  });

  it('un enlace vacío abre el ejemplo de siempre', () => {
    expect(readLinkShare({ v: 1 }, 'microondas')).toEqual(fresh());
  });

  it('un valor imposible no abre nada a medias', () => {
    expect(readLinkShare({ p: { frequencyMHz: 12000 } }, 'microondas')).toBeNull(); // no está en el menú
    expect(readLinkShare({ p: { frequencyMHz: 11000 } }, 'radio')).toBeNull(); // 11 GHz no es de radio
    expect(readLinkShare({ p: { antennaA: 10 } }, 'microondas')).toBeNull(); // parábola de hasta 5 m
    expect(readLinkShare({ p: { antennaA: 10 } }, 'radio')).toEqual({ ...readLinkShare({}, 'radio'), params: { ...PRESETS.radio.params, antennaA: 10 } }); // 10 dBi sí
    expect(readLinkShare({ k: '2' }, 'microondas')).toBeNull();
    expect(readLinkShare({ t: 'desierto' }, 'microondas')).toBeNull();
    expect(readLinkShare({ rr: 300 }, 'microondas')).toBeNull(); // lluvia hasta 250 mm/h
    expect(readLinkShare({ a: [95, -75.7] }, 'microondas')).toBeNull();
  });
});
