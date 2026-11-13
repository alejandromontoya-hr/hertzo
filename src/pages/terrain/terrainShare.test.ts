import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL_THRESHOLDS_DBM } from '../../coverage/colorScale';
import { DEFAULT_RADIO_PROFILE_ID, DEFAULT_RADIUS_KM, LMR_BANDS, RADIO_PROFILES } from '../../data/defaults';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { readTerrainShare, terrainShareData, type TerrainShare } from './terrainShare';

const band800 = LMR_BANDS.find((b) => b.id === '800')!;
const portable = RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;
const other = RADIO_PROFILES.find((p) => p.id !== DEFAULT_RADIO_PROFILE_ID)!;

/** La página recién abierta en 800 MHz, sin tocar nada. */
const fresh = (): TerrainShare => ({
  site: null,
  name: '',
  radiusKm: DEFAULT_RADIUS_KM,
  tx: { ...band800.tx },
  rx: { ...band800.rx },
  radio: portable,
  thresholds: [...DEFAULT_LEVEL_THRESHOLDS_DBM],
  capacity: {},
  devices: [],
});

describe('terrainShareData', () => {
  it('sin cambios no lleva nada: el enlace queda casi vacío', () => {
    expect(terrainShareData(fresh(), band800)).toEqual({});
  });

  it('lleva solo lo que cambió: el sitio, su nombre y 50 W en el transmisor', () => {
    const state = { ...fresh(), site: { lat: 6.2627, lon: -75.5806 }, name: 'Cerro El Volador', tx: { ...band800.tx, transmitterPowerW: 50 } };
    expect(terrainShareData(state, band800)).toEqual({ s: [6.2627, -75.5806], n: 'Cerro El Volador', tx: { transmitterPowerW: 50 } });
  });

  it('cada equipo es [nombre, lat, lon] y el perfil solo si tiene uno propio', () => {
    const state = {
      ...fresh(),
      devices: [
        { name: 'Portátil 1', position: { lat: 6.25, lon: -75.6 }, profileId: null },
        { name: 'Móvil 2', position: { lat: 6.3, lon: -75.55 }, profileId: other.id },
      ],
    };
    expect(terrainShareData(state, band800).e).toEqual([
      ['Portátil 1', 6.25, -75.6],
      ['Móvil 2', 6.3, -75.55, other.id],
    ]);
  });
});

describe('readTerrainShare', () => {
  it('lo que sale del enlace es lo que había en la página', async () => {
    const state: TerrainShare = {
      site: { lat: 6.2627, lon: -75.5806 },
      name: 'Cerro El Volador',
      radiusKm: 30,
      tx: { ...band800.tx, transmitterPowerW: 50, antennaHeightM: 45 },
      rx: { ...band800.rx, towerAmplifierGainDb: 12 },
      radio: { ...portable, id: 'personalizado', name: 'Personalizado', powerW: 5, bodyLossDb: 10 },
      thresholds: [-85, -98, -108],
      capacity: { channels: 6 },
      devices: [{ name: 'Portátil 1', position: { lat: 6.25, lon: -75.6 }, profileId: other.id }],
    };
    const decoded = await decodeShare(await encodeShare(terrainShareData(state, band800)));
    expect(decoded.ok && readTerrainShare(decoded.data, band800)).toEqual(state);
  });

  it('un enlace vacío abre la página como siempre', () => {
    expect(readTerrainShare({ v: 1 }, band800)).toEqual(fresh());
  });

  it('un valor imposible no abre nada a medias', () => {
    expect(readTerrainShare({ tx: { transmitterPowerW: 0 } }, band800)).toBeNull(); // debe ser mayor que 0 W
    expect(readTerrainShare({ r: 500 }, band800)).toBeNull(); // el radio llega a 100 km
    expect(readTerrainShare({ p: 'no-existe' }, band800)).toBeNull();
    expect(readTerrainShare({ s: [95, -75.5806] }, band800)).toBeNull();
    expect(readTerrainShare({ u: [-80, -95] }, band800)).toBeNull(); // faltan umbrales
    expect(readTerrainShare({ e: [['Portátil 1', 6.25, -75.6, 'no-existe']] }, band800)).toBeNull();
    expect(readTerrainShare({ c: { channels: 0 } }, band800)).toBeNull(); // mínimo 1 canal
  });
});
