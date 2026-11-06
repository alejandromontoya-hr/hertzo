// Equipos concretos sobre el mapa (medidores, sensores, radios): leer la lista que pega el
// usuario y evaluar cada equipo con el balance de enlace. Módulo puro: sin interfaz.

import { balanceClass, type BalanceClass } from '../coverage/colorScale';
import type { LonLat } from '../geo/geodesy';
import { receivedPowerDbm, type LinkBudget } from '../rf/linkBudget';
import { freeSpaceLossDb } from '../rf/fieldStrength';

export interface DeviceInput {
  name: string;
  position: LonLat;
  /** Perfil escrito en la lista (id o nombre); null si no trae, y entonces usa el elegido en el panel. */
  profile: string | null;
}

export interface ParsedDeviceList {
  devices: DeviceInput[];
  errors: string[];
}

/** "6,2442" o "6.2442" → 6.2442; también acepta el signo menos tipográfico. */
const parseNumber = (text: string): number => {
  const normalized = text.trim().replace(',', '.').replace('−', '-');
  return normalized === '' ? Number.NaN : Number(normalized);
};

/**
 * Lee una lista pegada de Excel, de un CSV o escrita a mano. Cada línea trae
 * "nombre, latitud, longitud[, tipo]" o solo "latitud, longitud". El separador se detecta por
 * línea: tabulador (Excel), punto y coma (CSV de Excel en español) o coma. Una primera línea
 * que no sea de números se toma como encabezado.
 */
export function parseDeviceList(text: string): ParsedDeviceList {
  const devices: DeviceInput[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line === '') return;
    const separator = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const fields = line.split(separator).map((f) => f.trim());
    const unnamed = fields.length >= 2 && Number.isFinite(parseNumber(fields[0]!)) && Number.isFinite(parseNumber(fields[1]!));
    const [name, latText, lonText, profile] = unnamed
      ? [`Equipo ${devices.length + 1}`, fields[0]!, fields[1]!, fields[2]]
      : [fields[0]!, fields[1] ?? '', fields[2] ?? '', fields[3]];
    const lat = parseNumber(latText);
    const lon = parseNumber(lonText);
    const where = `Línea ${i + 1}`;

    if (!Number.isFinite(lat)) {
      // La primera línea con texto donde va la latitud es el encabezado.
      if (devices.length === 0 && errors.length === 0 && !lines.slice(0, i).some((l) => l.trim() !== '')) return;
      errors.push(`${where}: la latitud "${latText}" no es un número.`);
      return;
    }
    if (!Number.isFinite(lon)) {
      errors.push(`${where}: la longitud "${lonText}" no es un número.`);
      return;
    }
    if (Math.abs(lat) > 90) {
      errors.push(`${where}: la latitud ${latText} está fuera de rango (−90 a 90).`);
      return;
    }
    if (Math.abs(lon) > 180) {
      errors.push(`${where}: la longitud ${lonText} está fuera de rango (−180 a 180).`);
      return;
    }
    devices.push({ name, position: { lat, lon }, profile: profile ? profile : null });
  });

  return { devices, errors };
}

export type DeviceStatus = BalanceClass | 'unknown';

export interface DeviceResult {
  downDbm: number;
  upDbm: number;
  downMarginDb: number;
  upMarginDb: number;
  /** Llegan las dos, solo una, ninguna, o "unknown" si no se pudo calcular el trayecto. */
  status: DeviceStatus;
}

/** Nivel y margen de un equipo en bajada y en subida, a partir de la pérdida de cada trayecto (dB). */
export function evaluateDevice(down: LinkBudget, up: LinkBudget, lossDownDb: number, lossUpDb: number): DeviceResult {
  const downDbm = receivedPowerDbm(down, lossDownDb);
  const upDbm = receivedPowerDbm(up, lossUpDb);
  const downMarginDb = downDbm - down.sensitivityDbm;
  const upMarginDb = upDbm - up.sensitivityDbm;
  const status = Number.isNaN(downMarginDb) || Number.isNaN(upMarginDb) ? 'unknown' : balanceClass(downMarginDb, upMarginDb);
  return { downDbm, upDbm, downMarginDb, upMarginDb, status };
}

/**
 * Pérdida (dB) de un equipo muy cerca del sitio, donde el ITM no aplica: espacio libre con la
 * distancia real entre las dos antenas, contando la diferencia de altura. A 11 m de la torre,
 * con la antena del sitio a 15 m y el equipo a 0,5 m, la distancia es √(11² + 14,5²) = 18,2 m.
 * Supone el terreno plano entre los dos, que a menos de 50 m casi siempre se cumple.
 */
export function closeRangeLossDb(horizontalM: number, siteHeightM: number, deviceHeightM: number, frequencyMHz: number): number {
  // Nunca menos de 1 m, para no dar pérdidas negativas con el equipo debajo de la antena.
  const slantM = Math.max(1, Math.hypot(horizontalM, siteHeightM - deviceHeightM));
  return freeSpaceLossDb(slantM / 1000, frequencyMHz);
}
