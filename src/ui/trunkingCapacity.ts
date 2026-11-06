// Sección "Capacidad" de Terreno: cuántas llamadas esperan canal en la hora pico según cuántos
// radios hablan, cuánto y con cuántos canales de voz. Erlang C, como una fila de trunking.

import { averageWaitSeconds, erlangC, offeredTrafficErlang, probabilityWaitLongerThan } from '../rf/traffic';
import { createFieldGroup, type NumberFieldSpec } from './fields';

interface CapacityValues {
  radios: number;
  callsPerHour: number;
  holdSeconds: number;
  channels: number;
  waitLimitSeconds: number;
}

const FIELDS: readonly NumberFieldSpec<keyof CapacityValues>[] = [
  { key: 'radios', label: 'Radios', unit: 'radios', min: 1, max: 100000, hint: 'Si ubicaste equipos arriba, toma ese número; puedes cambiarlo.' },
  { key: 'callsPerHour', label: 'Llamadas por radio en la hora pico', unit: 'por hora', min: 0, max: 1000 },
  { key: 'holdSeconds', label: 'Duración de cada llamada', unit: 's', min: 1, max: 3600, hint: 'Desde que se asigna el canal hasta que se libera, con el tiempo de cola de la repetidora.' },
  { key: 'channels', label: 'Canales de voz', unit: 'canales', min: 1, max: 100, hint: 'Sin contar el canal de control. Un convencional es 1 canal.' },
  { key: 'waitLimitSeconds', label: 'Espera aceptable', unit: 's', min: 0, max: 600 },
];

const DEFAULTS: CapacityValues = { radios: 20, callsPerHour: 6, holdSeconds: 15, channels: 4, waitLimitSeconds: 5 };

const erlangFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const secondsFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
/** El límite que escribió el usuario, tal cual: 5 → "5"; 2,5 → "2,5". */
const limitFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** 0,1 → "10,0 %"; menos de 0,05 % → "< 0,1 %", para no mostrar "0,0 %" cuando sí espera alguien. */
export function formatShare(fraction: number): string {
  if (fraction > 0 && fraction < 0.0005) return '< 0,1 %';
  return `${percentFormat.format(fraction * 100)} %`;
}

/** 1 → "1,0 s"; menos de 0,05 s → "< 0,1 s"; sistema saturado → "sin límite". */
/** Para una frase: "el 10,0 %", o "menos del 0,1 %" cuando es casi nada (no "el < 0,1 %"). */
export function sharePhrase(fraction: number): string {
  const share = formatShare(fraction);
  return share.startsWith('<') ? `menos del ${share.slice(2)}` : `el ${share}`;
}

export function formatWait(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'sin límite';
  if (seconds > 0 && seconds < 0.05) return '< 0,1 s';
  return `${secondsFormat.format(seconds)} s`;
}

export interface TrunkingCapacity {
  /** Número de radios ubicados en "Equipos": reemplaza el campo mientras el usuario no lo haya escrito. */
  setDeviceCount(count: number): void;
}

export function createTrunkingCapacity(container: HTMLElement): TrunkingCapacity {
  let values = { ...DEFAULTS };
  let radiosTyped = false;
  const form = document.createElement('div');
  form.className = 'form';
  const result = document.createElement('div');
  container.append(form, result);

  const fields = createFieldGroup<CapacityValues>(form, FIELDS, values, (next) => {
    if (next.radios !== values.radios) radiosTyped = true;
    values = { ...next, channels: Math.round(next.channels), radios: Math.round(next.radios) };
    show();
  });

  function show() {
    const { radios, callsPerHour, holdSeconds, channels, waitLimitSeconds } = values;
    const traffic = offeredTrafficErlang(radios, callsPerHour, holdSeconds);
    // La fila elegida y sus vecinas: se ve qué gana o pierde con un canal más o uno menos.
    const options = [...new Set([Math.max(1, channels - 1), channels, channels + 1, channels + 2])];
    const rows = options
      .map((n) => {
        const saturated = traffic >= n;
        return `<tr${n === channels ? ' class="strong"' : ''}>
          <th scope="row">${n}</th>
          <td>${saturated ? 'todas' : formatShare(erlangC(n, traffic))}</td>
          <td>${formatWait(averageWaitSeconds(n, traffic, holdSeconds))}</td>
          <td>${saturated ? 'todas' : formatShare(probabilityWaitLongerThan(n, traffic, holdSeconds, waitLimitSeconds))}</td>
        </tr>`;
      })
      .join('');
    const saturated = traffic >= channels;
    const summary = saturated
      ? `Con ${channels} ${channels === 1 ? 'canal' : 'canales'} el sistema se satura: hay más tráfico (${erlangFormat.format(traffic)} Erl) que canales, y la fila crece sin parar.`
      : `${erlangFormat.format(traffic)} Erl en la hora pico. Con ${channels} ${channels === 1 ? 'canal' : 'canales'}, espera ${sharePhrase(erlangC(channels, traffic))} de las llamadas y ${sharePhrase(
          probabilityWaitLongerThan(channels, traffic, holdSeconds, waitLimitSeconds),
        )} espera más de ${limitFormat.format(waitLimitSeconds)} s.`;
    result.innerHTML = `
      <table class="budget">
        <thead><tr><th>Canales</th><th>Esperan</th><th>Espera prom.</th><th>Más de ${limitFormat.format(waitLimitSeconds)} s</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="budget-summary">${summary}</p>
      <p class="hint">Erlang C: las llamadas hacen fila hasta que se libera un canal. Es la hora pico de todo el sitio, no de un grupo.</p>`;
  }

  show();

  return {
    setDeviceCount(count) {
      if (radiosTyped || count === 0 || count === values.radios) return;
      values = { ...values, radios: count };
      fields.setValues(values);
      show();
    },
  };
}
