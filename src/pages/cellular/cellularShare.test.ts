import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { BANDS, BASE_ANTENNA, BASE_SITE, CELL_THRESHOLDS, DEFAULT_RADIUS_KM } from './cellularFields';
import { cellularShareData, readCellularShare, type CellularShare } from './cellularShare';

const band850 = BANDS.find((b) => b.id === '850')!;
const band3500 = BANDS.find((b) => b.id === '3500')!;

/** La página recién abierta en 850 MHz, sin tocar nada. */
const fresh = (): CellularShare => ({
  site: null,
  name: '',
  radiusKm: DEFAULT_RADIUS_KM,
  thresholds: [...CELL_THRESHOLDS.rsrp.defaults],
  model: 'hata-urbano',
  siteParams: { ...BASE_SITE },
  antenna: { ...BASE_ANTENNA },
  phone: 'exterior',
  neighborKm: 1,
  azimuths: [0, 120, 240],
  carrierId: 'lte10',
  sinrThresholds: [...CELL_THRESHOLDS.sinr.defaults],
  upThresholds: [...CELL_THRESHOLDS.up.defaults],
});

describe('cellularShareData', () => {
  it('sin cambios no lleva nada', () => {
    expect(cellularShareData(fresh(), band850)).toEqual({});
  });

  it('en 3500 MHz los 200 W y 24 dBi de la antena activa no viajan: son los de la banda', () => {
    const state = { ...fresh(), model: 'uma' as const, siteParams: { ...BASE_SITE, powerW: 200, cableLossDb: 0 }, antenna: { ...BASE_ANTENNA, gainDbi: 24, verticalBeamwidthDeg: 10 }, carrierId: 'nr80' };
    expect(cellularShareData(state, band3500)).toEqual({});
  });

  it('lleva solo lo que cambió: 2 sectores a 30° y 210°, 6° de inclinación y el teléfono adentro', () => {
    const state = { ...fresh(), azimuths: [30, 210], antenna: { ...BASE_ANTENNA, downtiltDeg: 6 }, phone: 'interior-bajas' as const };
    expect(cellularShareData(state, band850)).toEqual({ z: [30, 210], a: { downtiltDeg: 6 }, ph: 'interior-bajas' });
  });
});

describe('readCellularShare', () => {
  it('lo que sale del enlace es lo que había en la página', async () => {
    const state: CellularShare = {
      ...fresh(),
      site: { lat: 6.2442, lon: -75.5812 },
      name: 'Torre El Poblado',
      radiusKm: 8,
      model: 'itm',
      siteParams: { ...BASE_SITE, antennaHeightM: 45, uePowerW: 0.1 },
      neighborKm: 0,
      carrierId: 'lte20',
      thresholds: [-85, -95, -105, -115],
      sinrThresholds: [18, 10, 3, -2],
    };
    const decoded = await decodeShare(await encodeShare(cellularShareData(state, band850)));
    expect(decoded.ok && readCellularShare(decoded.data, band850)).toEqual(state);
  });

  it('un enlace vacío abre la página como siempre', () => {
    expect(readCellularShare({ v: 1 }, band850)).toEqual(fresh());
  });

  it('un valor imposible no abre nada a medias', () => {
    expect(readCellularShare({ z: [0, 90, 180, 270, 300] }, band850)).toBeNull(); // hasta 4 sectores
    expect(readCellularShare({ z: [400] }, band850)).toBeNull();
    expect(readCellularShare({ m: 'no-existe' }, band850)).toBeNull();
    expect(readCellularShare({ cr: 'lte50' }, band850)).toBeNull();
    expect(readCellularShare({ ph: 'sotano' }, band850)).toBeNull();
    expect(readCellularShare({ k: 25 }, band850)).toBeNull(); // vecinos hasta 20 km
    expect(readCellularShare({ r: 50 }, band850)).toBeNull(); // radio hasta 40 km
    expect(readCellularShare({ sp: { powerW: 0 } }, band850)).toBeNull();
    expect(readCellularShare({ us: [20, 13, 5] }, band850)).toBeNull(); // faltan umbrales
  });
});
