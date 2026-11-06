// "Confiabilidad de la cobertura": con qué probabilidad llega la señal en cada punto (ITM).
// 50 % es la mediana (la mitad de los lugares y del tiempo llega más fuerte); la radio
// profesional se diseña al 90–95 % (TIA TSB-88). La elección queda en la dirección: ?confiabilidad=95.

import type { CoverageRequest } from '../coverage/computeCoverage';
import { infoButton } from './infoTip';

export const RELIABILITY_OPTIONS = [50, 90, 95] as const;
export type Reliability = (typeof RELIABILITY_OPTIONS)[number];

/** Lee la confiabilidad de la dirección; si no hay o no es válida, la de la página. */
export function parseReliability(params: URLSearchParams, fallback: Reliability): Reliability {
  const value = Number(params.get('confiabilidad'));
  return (RELIABILITY_OPTIONS as readonly number[]).includes(value) ? (value as Reliability) : fallback;
}

/** Confiabilidad con que se hizo un cálculo de cobertura: 50 % si fue la mediana. */
export function requestReliability(request: CoverageRequest): number {
  return request.engine.id === 'itm' ? (request.engine.params?.timePct ?? 50) : 50;
}

export function createReliabilityControl(container: HTMLElement, initial: Reliability, onChange: (value: Reliability) => void): void {
  const field = document.createElement('div');
  field.className = 'field field-select';
  field.innerHTML = `<label for="confiabilidad">Confiabilidad de la cobertura${infoButton(
    'Con qué probabilidad llega la señal en cada punto. 50 % es la mediana: en la mitad de los lugares y del tiempo llega más débil. La radio profesional se diseña al 90 o 95 %: en el terreno de Medellín eso exige unos 12 o 16 dB más de señal.',
  )}</label><select id="confiabilidad">${RELIABILITY_OPTIONS.map(
    (r) => `<option value="${r}">${r} %${r === 50 ? ' (mediana)' : ''}</option>`,
  ).join('')}</select>`;
  const select = field.querySelector('select')!;
  select.value = String(initial);
  select.addEventListener('change', () => onChange(Number(select.value) as Reliability));
  container.append(field);
}
