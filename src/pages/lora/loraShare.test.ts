import { describe, expect, it } from 'vitest';
import { DEFAULT_LEVEL_THRESHOLDS_DBM } from '../../coverage/colorScale';
import { DEFAULT_LORA_GATEWAY, DEFAULT_LORA_SENSOR_ID, LORA_SENSORS } from '../../data/lora';
import { decodeShare, encodeShare } from '../../export/shareLink';
import { DEFAULT_ADR_MARGIN_DB } from '../../rf/lora';
import { DEFAULT_PAYLOAD_BYTES, DEFAULT_RADIUS_KM } from './loraFields';
import { loraShareData, readLoraShare, type LoraShare } from './loraShare';

const defaultSensor = LORA_SENSORS.find((s) => s.id === DEFAULT_LORA_SENSOR_ID)!;
const otherSensor = LORA_SENSORS.find((s) => s.id !== DEFAULT_LORA_SENSOR_ID)!;

/** La página recién abierta, sin tocar nada. */
const fresh = (): LoraShare => ({
  site: null,
  name: '',
  radiusKm: DEFAULT_RADIUS_KM,
  thresholds: [...DEFAULT_LEVEL_THRESHOLDS_DBM],
  devices: [],
  gateway: { ...DEFAULT_LORA_GATEWAY },
  sensor: defaultSensor,
  payloadBytes: DEFAULT_PAYLOAD_BYTES,
  adrMarginDb: DEFAULT_ADR_MARGIN_DB,
  capacity: {},
});

describe('loraShareData', () => {
  it('sin cambios no lleva nada', () => {
    expect(loraShareData(fresh())).toEqual({});
  });

  it('lleva solo lo que cambió: el gateway a 1 W y 45 m, 24 bytes y margen de 15 dB', () => {
    const state = { ...fresh(), gateway: { ...DEFAULT_LORA_GATEWAY, powerW: 1, antennaHeightM: 45 }, payloadBytes: 24, adrMarginDb: 15 };
    expect(loraShareData(state)).toEqual({ g: { powerW: 1, antennaHeightM: 45 }, b: 24, m: 15 });
  });
});

describe('readLoraShare', () => {
  it('lo que sale del enlace es lo que había en la página: un gateway y 20 medidores de dos tipos', async () => {
    const state: LoraShare = {
      ...fresh(),
      site: { lat: 6.2627, lon: -75.5806 },
      name: 'Gateway Torre Norte',
      gateway: { ...DEFAULT_LORA_GATEWAY, powerW: 1 },
      sensor: { ...defaultSensor, id: 'personalizado', name: 'Personalizado', enclosureLossDb: 15 },
      capacity: { intervalMinutes: 60, sf: 9 },
      devices: Array.from({ length: 20 }, (_, i) => ({
        name: `Medidor ${1000 + i}`,
        position: { lat: (6250 + i) / 1000, lon: (-75600 + i) / 1000 },
        profileId: i % 2 === 0 ? otherSensor.id : null,
      })),
    };
    const decoded = await decodeShare(await encodeShare(loraShareData(state)));
    expect(decoded.ok && readLoraShare(decoded.data)).toEqual(state);
  });

  it('un enlace vacío abre la página como siempre', () => {
    expect(readLoraShare({ v: 1 })).toEqual(fresh());
  });

  it('un valor imposible no abre nada a medias', () => {
    expect(readLoraShare({ g: { powerW: 20 } })).toBeNull(); // el gateway llega a 10 W
    expect(readLoraShare({ b: 300 })).toBeNull(); // hasta 222 bytes por mensaje
    expect(readLoraShare({ b: 11.5 })).toBeNull(); // bytes enteros
    expect(readLoraShare({ m: -1 })).toBeNull();
    expect(readLoraShare({ c: { sf: 13 } })).toBeNull(); // de SF7 a SF12
    expect(readLoraShare({ p: 'personalizado', pv: { powerW: 2 } })).toBeNull(); // el sensor llega a 1 W
    expect(readLoraShare({ e: [['Medidor 1', 6.25, -75.6, 'no-existe']] })).toBeNull();
  });
});
