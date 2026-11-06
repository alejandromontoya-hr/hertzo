import { describe, expect, it } from 'vitest';
import type { LinkBudget } from '../rf/linkBudget';
import { closeRangeLossDb, evaluateDevice, parseDeviceList } from './devices';

describe('parseDeviceList', () => {
  it('lista pegada de Excel (tabulador y coma decimal), con encabezado', () => {
    const text = 'Nombre\tLatitud\tLongitud\tTipo\nMedidor 1\t6,2442\t-75,5812\tmedidor-caja\nMedidor 2\t6,2500\t-75,5700\n';
    const { devices, errors } = parseDeviceList(text);
    expect(errors).toEqual([]);
    expect(devices).toEqual([
      { name: 'Medidor 1', position: { lat: 6.2442, lon: -75.5812 }, profile: 'medidor-caja' },
      { name: 'Medidor 2', position: { lat: 6.25, lon: -75.57 }, profile: null },
    ]);
  });

  it('separado por comas con punto decimal, como sale de Google Maps', () => {
    const { devices } = parseDeviceList('Radio 7, 6.27940, -75.68530');
    expect(devices).toEqual([{ name: 'Radio 7', position: { lat: 6.2794, lon: -75.6853 }, profile: null }]);
  });

  it('separado por punto y coma (CSV de Excel en español)', () => {
    const { devices } = parseDeviceList('Sensor A;6,1;-75,2;poste');
    expect(devices[0]).toEqual({ name: 'Sensor A', position: { lat: 6.1, lon: -75.2 }, profile: 'poste' });
  });

  it('sin nombre: solo latitud y longitud, se numeran "Equipo 1", "Equipo 2"', () => {
    const { devices } = parseDeviceList('6.1\t-75.2\n6.2\t-75.3');
    expect(devices.map((d) => d.name)).toEqual(['Equipo 1', 'Equipo 2']);
    expect(devices[1]!.position).toEqual({ lat: 6.2, lon: -75.3 });
  });

  it('avisa la línea con error y carga las demás', () => {
    const { devices, errors } = parseDeviceList('Nombre;Lat;Lon\nA;6,1;-75,2\nB;96;-75\nC;abc;-75');
    expect(devices.map((d) => d.name)).toEqual(['A']);
    expect(errors).toEqual([
      'Línea 3: la latitud 96 está fuera de rango (−90 a 90).',
      'Línea 4: la latitud "abc" no es un número.',
    ]);
  });

  it('ignora líneas vacías', () => {
    expect(parseDeviceList('\n  \nA, 1, 2\n\n').devices).toHaveLength(1);
  });
});

function budget(eirpDbm: number, sensitivityDbm: number): LinkBudget {
  return {
    direction: 'talk-out',
    frequencyMHz: 900,
    txPowerDbm: eirpDbm,
    txLossesDb: 0,
    txAntennaGainDbi: 0,
    erpDbm: eirpDbm - 2.15,
    eirpDbm,
    rxAntennaGainDbi: 2,
    rxGainsDb: 0,
    rxLossesDb: 1,
    sensitivityDbm,
    maxPathLossDb: 0,
  };
}

describe('evaluateDevice', () => {
  // Nivel = PIRE − pérdida + 2 dBi − 1 dB.
  const down = budget(30, -131);
  const up = budget(22, -139);

  it('pérdida 150 dB en las dos: bajada −119 dBm (margen +12), subida −127 dBm (margen +12), llegan las dos', () => {
    const r = evaluateDevice(down, up, 150, 150);
    expect(r.downDbm).toBeCloseTo(-119, 10);
    expect(r.upDbm).toBeCloseTo(-127, 10);
    expect(r.downMarginDb).toBeCloseTo(12, 10);
    expect(r.upMarginDb).toBeCloseTo(12, 10);
    expect(r.status).toBe('both');
  });

  it('pérdida 165 dB: bajada −134 (margen −3) y subida −142 (margen −3): no llega ninguna', () => {
    expect(evaluateDevice(down, up, 165, 165).status).toBe('none');
  });

  it('bajada 165 dB y subida 150 dB: solo llega la subida', () => {
    expect(evaluateDevice(down, up, 165, 150).status).toBe('talkInOnly');
  });

  it('sin cálculo (NaN): estado "sin cálculo"', () => {
    expect(evaluateDevice(down, up, Number.NaN, Number.NaN).status).toBe('unknown');
  });
});

describe('closeRangeLossDb', () => {
  // Caseta 9 de la Central Ganadera: 11 m del gateway, antena a 15 m, medidor a 0,5 m.
  // Distancia real √(11² + 14,5²) = 18,2003 m; 32,45 + 20·log 916,8 + 20·log 0,0182003 = 56,897 dB.
  it('subida en 916,8 MHz: 56,897 dB', () => {
    expect(closeRangeLossDb(11, 15, 0.5, 916.8)).toBeCloseTo(56.897, 3);
  });

  it('bajada en 923,3 MHz: 56,958 dB, un poco más por ser más alta', () => {
    expect(closeRangeLossDb(11, 15, 0.5, 923.3)).toBeCloseTo(56.958, 3);
  });

  it('a 42 m: √(42² + 14,5²) = 44,43 m y 64,650 dB', () => {
    expect(closeRangeLossDb(42, 15, 0.5, 916.8)).toBeCloseTo(64.65, 2);
  });

  it('justo debajo y a la misma altura cuenta 1 m, no da una pérdida infinita', () => {
    expect(closeRangeLossDb(0, 2, 2, 916.8)).toBeCloseTo(32.45 + 59.2459 - 60, 3);
  });
});
