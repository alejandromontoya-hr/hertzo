// Capacidad de tráfico: cuántas llamadas esperan canal en un sistema trunking (Erlang C) y
// cuántos mensajes LoRa chocan en el aire (ALOHA puro). Módulo puro: sin interfaz.

import type { SpreadingFactor } from './lora';

/** Tráfico ofrecido (erlangs) = usuarios × llamadas por hora × duración (s) / 3600. 20 × 6 × 15 s = 0,5 Erl. */
export function offeredTrafficErlang(users: number, callsPerHour: number, holdSeconds: number): number {
  return (users * callsPerHour * holdSeconds) / 3600;
}

/**
 * Erlang B: probabilidad de encontrar los `channels` ocupados si las llamadas no esperan.
 * Se calcula con la recurrencia B(k) = A·B(k−1) / (k + A·B(k−1)), estable con muchos canales.
 */
export function erlangB(channels: number, trafficErlang: number): number {
  let b = 1;
  for (let k = 1; k <= channels; k++) b = (trafficErlang * b) / (k + trafficErlang * b);
  return b;
}

/**
 * Erlang C: fracción de las llamadas que encuentran todos los canales ocupados y hacen fila,
 * como en el trunking. C = N·B / (N − A·(1 − B)); con tráfico ≥ canales, espera todo el mundo.
 */
export function erlangC(channels: number, trafficErlang: number): number {
  if (trafficErlang >= channels) return 1;
  const b = erlangB(channels, trafficErlang);
  return (channels * b) / (channels - trafficErlang * (1 - b));
}

/** Espera promedio de todas las llamadas (s) = C · duración / (N − A). 2 canales, 0,5 Erl, 15 s: 1 s. */
export function averageWaitSeconds(channels: number, trafficErlang: number, holdSeconds: number): number {
  if (trafficErlang >= channels) return Number.POSITIVE_INFINITY;
  return (erlangC(channels, trafficErlang) * holdSeconds) / (channels - trafficErlang);
}

/** Fracción de las llamadas que esperan más de `seconds` = C · e^(−(N − A)·t / duración). */
export function probabilityWaitLongerThan(channels: number, trafficErlang: number, holdSeconds: number, seconds: number): number {
  if (trafficErlang >= channels) return 1;
  return erlangC(channels, trafficErlang) * Math.exp((-(channels - trafficErlang) * seconds) / holdSeconds);
}

/**
 * ALOHA puro: con carga G (fracción del tiempo que el canal está ocupado), un mensaje se salva
 * si nadie transmite en la ventana de dos mensajes: se pierde 1 − e^(−2G).
 */
export function pureAlohaLoss(load: number): number {
  return 1 - Math.exp(-2 * load);
}

export interface LoraTransmitter {
  spreadingFactor: SpreadingFactor;
  timeOnAirMs: number;
}

export interface LoraCollisionResult {
  /** Por SF: cuántos equipos, la carga de cada canal y la fracción de mensajes que se pierden. */
  bySf: Map<SpreadingFactor, { devices: number; load: number; loss: number }>;
  /** Fracción de todos los mensajes que se pierden (todos los equipos envían igual de seguido). */
  overallLoss: number;
}

/**
 * Mensajes LoRa que chocan: cada equipo envía cada `intervalSeconds` en un canal al azar de
 * `channels`. Mensajes con SF distinto no chocan entre sí, así que cada SF es un ALOHA aparte.
 * No cuenta el efecto captura (a veces el más fuerte se recibe igual): la pérdida real es algo menor.
 */
export function loraCollisionLoss(
  transmitters: readonly LoraTransmitter[],
  intervalSeconds: number,
  channels: number,
): LoraCollisionResult {
  const bySf = new Map<SpreadingFactor, { devices: number; load: number; loss: number }>();
  for (const t of transmitters) {
    const entry = bySf.get(t.spreadingFactor) ?? { devices: 0, load: 0, loss: 0 };
    entry.devices++;
    entry.load += t.timeOnAirMs / 1000 / (intervalSeconds * channels);
    bySf.set(t.spreadingFactor, entry);
  }
  let lost = 0;
  for (const entry of bySf.values()) {
    entry.loss = pureAlohaLoss(entry.load);
    lost += entry.loss * entry.devices;
  }
  return { bySf, overallLoss: transmitters.length === 0 ? 0 : lost / transmitters.length };
}
