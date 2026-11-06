// Sección "Capacidad" de LoRa: qué parte de los mensajes choca en el aire según cuántos
// medidores hay, cada cuánto envían y con qué SF. ALOHA puro, un SF independiente del otro.

import { SPREADING_FACTORS, type SpreadingFactor } from '../rf/lora';
import { loraCollisionLoss, type LoraTransmitter } from '../rf/traffic';
import { createFieldGroup, type NumberFieldSpec } from './fields';
import { formatShare } from './trunkingCapacity';

interface CapacityValues {
  meters: number;
  intervalMinutes: number;
  channels: number;
}

const FIELDS: readonly NumberFieldSpec<keyof CapacityValues>[] = [
  { key: 'meters', label: 'Medidores', unit: 'medidores', min: 1, max: 1000000, hint: 'Si ubicaste equipos arriba, toma ese número y el SF de cada uno; si lo cambias, todos usan el SF de abajo.' },
  { key: 'intervalMinutes', label: 'Cada medidor envía cada', unit: 'min', min: 0.1, max: 10080 },
  { key: 'channels', label: 'Canales del gateway', unit: 'canales', min: 1, max: 64, hint: 'Un gateway de 8 canales escucha una sub-banda de AU915 o US915.' },
];

const DEFAULTS: CapacityValues = { meters: 30, intervalMinutes: 15, channels: 8 };

const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const minutesFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

export interface LoraCapacityContext {
  /** SF de cada medidor ubicado en "Equipos" (null si no le llega), o vacío si no hay. */
  deviceSfs(): (SpreadingFactor | null)[];
  /** Tiempo en el aire (ms) de un mensaje con ese SF y el tamaño actual. */
  timeOnAirMs(sf: SpreadingFactor): number;
  /** SF más lento permitido: SF12, o menos con el límite de 400 ms. */
  maxSf(): SpreadingFactor;
  /** Ciclo de trabajo máximo de cada medidor (%), si la norma de la banda lo pide (1 % en EU868). */
  dutyCyclePct?(): number | undefined;
  bandLabel?(): string;
}

export interface LoraCapacity {
  /** Vuelve a calcular (cambió el SF de un equipo, el tamaño del mensaje, el límite...). */
  update(): void;
  /** Número de medidores en "Equipos": reemplaza el campo mientras el usuario no lo haya escrito. */
  setDeviceCount(count: number): void;
}

export function createLoraCapacity(container: HTMLElement, context: LoraCapacityContext): LoraCapacity {
  let values = { ...DEFAULTS };
  let metersTyped = false;
  let deviceCount = 0;
  let uniformSf: SpreadingFactor = 10;

  const form = document.createElement('div');
  form.className = 'form';
  const sfField = document.createElement('div');
  sfField.className = 'field field-select';
  sfField.innerHTML = `<label for="capacidad-sf">SF de todos los medidores</label><select id="capacidad-sf">${SPREADING_FACTORS.map(
    (sf) => `<option value="${sf}">SF${sf}</option>`,
  ).join('')}</select>`;
  const select = sfField.querySelector('select')!;
  select.value = String(uniformSf);
  select.addEventListener('change', () => {
    uniformSf = Number(select.value) as SpreadingFactor;
    update();
  });
  const result = document.createElement('div');
  container.append(form, result);

  const fields = createFieldGroup<CapacityValues>(form, FIELDS, values, (next) => {
    if (next.meters !== values.meters) metersTyped = true;
    values = { ...next, meters: Math.round(next.meters), channels: Math.round(next.channels) };
    update();
  });
  form.append(sfField);

  /** Con equipos y sin número escrito, cada medidor con su SF; si no, todos con el SF elegido. */
  const fromDevices = () => !metersTyped && deviceCount > 0;

  function transmitters(): LoraTransmitter[] {
    const max = context.maxSf();
    if (fromDevices()) {
      // Un medidor sin cobertura igual transmite, con el SF más lento permitido: también ocupa el aire.
      return context.deviceSfs().map((sf) => {
        const used = sf ?? max;
        return { spreadingFactor: used, timeOnAirMs: context.timeOnAirMs(used) };
      });
    }
    const sf = uniformSf > max ? max : uniformSf;
    return Array.from({ length: values.meters }, () => ({ spreadingFactor: sf, timeOnAirMs: context.timeOnAirMs(sf) }));
  }

  function update() {
    sfField.hidden = fromDevices();
    const list = transmitters();
    const { bySf, overallLoss } = loraCollisionLoss(list, values.intervalMinutes * 60, values.channels);
    const rows = SPREADING_FACTORS.filter((sf) => bySf.has(sf))
      .map((sf) => {
        const e = bySf.get(sf)!;
        return `<tr><th scope="row">SF${sf}</th><td>${integerFormat.format(e.devices)}</td><td>${formatLoss(e.load)}</td><td>${formatLoss(e.loss)}</td></tr>`;
      })
      .join('');
    const n = list.length;
    const source = fromDevices() ? `${n} ${n === 1 ? 'medidor ubicado' : 'medidores ubicados'}, cada uno con su SF` : `${integerFormat.format(n)} medidores en SF${list[0]?.spreadingFactor ?? uniformSf}`;
    result.innerHTML = `
      <table class="budget">
        <thead><tr><th>SF</th><th>Medidores</th><th>Canal ocupado</th><th>Se pierden</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="budget-summary">Se pierde ${lossPhrase(overallLoss)} de los mensajes por choques: ${source}, cada ${minutesFormat.format(values.intervalMinutes)} min, en ${values.channels} ${values.channels === 1 ? 'canal' : 'canales'}.</p>
      ${dutyCycleNotice(list, values.intervalMinutes)}
      <p class="hint">ALOHA puro: dos mensajes del mismo SF que se cruzan en el mismo canal se pierden; con SF distinto no chocan. No cuenta el efecto captura, así que la pérdida real es algo menor.</p>`;
  }

  /** Aviso si el medidor más lento ocupa el canal más tiempo del que permite la norma (1 % en EU868). */
  function dutyCycleNotice(list: LoraTransmitter[], intervalMinutes: number): string {
    const limitPct = context.dutyCyclePct?.();
    if (!limitPct || list.length === 0) return '';
    const slowest = list.reduce((a, b) => (b.timeOnAirMs > a.timeOnAirMs ? b : a));
    const usedPct = (slowest.timeOnAirMs / (intervalMinutes * 60000)) * 100;
    if (usedPct <= limitPct) return '';
    const minIntervalS = slowest.timeOnAirMs / 1000 / (limitPct / 100);
    return `<p class="notice">En ${context.bandLabel?.() ?? 'esta banda'} cada medidor puede ocupar el canal como máximo el ${minutesFormat.format(limitPct)} % del tiempo. Con SF${slowest.spreadingFactor} (${minutesFormat.format(slowest.timeOnAirMs)} ms por mensaje) ocupa el ${minutesFormat.format(usedPct)} %: debe enviar cada ${integerFormat.format(Math.ceil(minIntervalS))} s o más.</p>`;
  }

  update();

  return {
    update,
    setDeviceCount(count) {
      deviceCount = count;
      if (!metersTyped && count > 0 && count !== values.meters) {
        values = { ...values, meters: count };
        fields.setValues(values);
      }
      update();
    },
  };
}

const significantFormat = new Intl.NumberFormat('es-CO', { maximumSignificantDigits: 2 });

/**
 * Parte de los mensajes, sin esconder lo pequeño: con pocos medidores la pérdida es de
 * milésimas de por ciento y cambia con cada ajuste, así que no se redondea a "< 0,1 %".
 * 0,0978 → "9,8 %"; 0,00034 → "0,034 %"; 0 → "0 %".
 */
export function formatLoss(fraction: number): string {
  if (fraction <= 0) return '0 %';
  if (fraction >= 0.0005) return formatShare(fraction);
  return `${significantFormat.format(fraction * 100)} %`;
}

/** "el <strong>9,8 %</strong> (1 de cada 10)"; sin pérdida, "el <strong>0 %</strong>". */
export function lossPhrase(fraction: number): string {
  const share = `el <strong>${formatLoss(fraction)}</strong>`;
  return fraction > 0 ? `${share} (1 de cada ${significantFormat.format(1 / fraction)})` : share;
}
