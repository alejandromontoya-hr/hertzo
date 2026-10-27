// Campos numéricos del formulario: lectura con coma o punto decimal y validación de rango.

import { infoButton } from './infoTip';

export interface NumberFieldSpec<K extends string = string> {
  key: K;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** El mínimo no se admite (potencias: deben ser mayores que 0 W). */
  minExclusive?: boolean;
  /** Explicación del campo; va en el botón «i» junto a la etiqueta. */
  hint?: string;
}

export type ParseResult = { ok: true; value: number } | { ok: false; error: string };

const numberFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 3, useGrouping: false });

/** Número para mostrar en un campo: 3.9 → "3,9"; −119 → "-119". */
export function formatFieldValue(value: number): string {
  return numberFormat.format(value).replace('−', '-');
}

/** Lee lo que escribió el usuario: "34,8" y "34.8" valen lo mismo. */
export function parseFieldValue(text: string, spec: NumberFieldSpec): ParseResult {
  const normalized = text.trim().replace(',', '.').replace('−', '-');
  if (normalized === '') return { ok: false, error: 'Escribe un valor.' };
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: 'No es un número.' };
  const range = `${formatFieldValue(spec.min)} y ${formatFieldValue(spec.max)} ${spec.unit}`;
  if (spec.minExclusive ? value <= spec.min : value < spec.min) {
    return {
      ok: false,
      error: spec.minExclusive
        ? `Debe ser mayor que ${formatFieldValue(spec.min)} ${spec.unit}.`
        : `Debe estar entre ${range}.`,
    };
  }
  if (value > spec.max) return { ok: false, error: `Debe estar entre ${range}.` };
  return { ok: true, value };
}

export interface NumberField {
  element: HTMLElement;
  setValue(value: number): void;
}

let fieldCounter = 0;

/** Campo con etiqueta, unidad y mensaje de error. `onValid` solo recibe valores válidos. */
export function createNumberField(
  spec: NumberFieldSpec,
  initial: number,
  onValid: (value: number) => void,
): NumberField {
  const id = `campo-${spec.key}-${++fieldCounter}`;
  const element = document.createElement('div');
  element.className = 'field';
  element.innerHTML = `
    <label for="${id}">${spec.label}${spec.hint ? infoButton(spec.hint) : ''}</label>
    <div class="field-input">
      <input id="${id}" type="text" inputmode="decimal" autocomplete="off" />
      <span class="field-unit">${spec.unit}</span>
    </div>
    <p class="field-error" hidden></p>`;
  const input = element.querySelector('input')!;
  const error = element.querySelector<HTMLElement>('.field-error')!;

  const showError = (message: string | null) => {
    error.hidden = message === null;
    error.textContent = message ?? '';
    input.setAttribute('aria-invalid', String(message !== null));
  };

  input.value = formatFieldValue(initial);
  input.addEventListener('input', () => {
    const result = parseFieldValue(input.value, spec);
    if (result.ok) {
      showError(null);
      onValid(result.value);
    } else {
      showError(result.error);
    }
  });

  return {
    element,
    setValue(value) {
      input.value = formatFieldValue(value);
      showError(null);
    },
  };
}

/**
 * Grupo de campos que edita un objeto (por ejemplo la cadena TX).
 * Cada cambio válido entrega una copia nueva del objeto completo.
 */
export function createFieldGroup<T extends object>(
  container: HTMLElement,
  specs: readonly NumberFieldSpec<Extract<keyof T, string>>[],
  initial: T,
  onChange: (next: T) => void,
): { setValues(values: T): void } {
  let current = { ...initial };
  const fields = specs.map((spec) => {
    const field = createNumberField(spec, current[spec.key] as number, (value) => {
      current = { ...current, [spec.key]: value };
      onChange(current);
    });
    container.append(field.element);
    return { spec, field };
  });

  return {
    setValues(values) {
      current = { ...values };
      for (const { spec, field } of fields) field.setValue(current[spec.key] as number);
    },
  };
}

/** Campo de selección con etiqueta (tipo de suelo, antena, modelo…). */
export function createSelectField(
  label: string,
  options: readonly { id: string; label: string }[],
  initial: string,
  onChange: (id: string) => void,
): { element: HTMLElement; setValue(id: string): void } {
  const id = `campo-select-${++fieldCounter}`;
  const element = document.createElement('div');
  element.className = 'field field-select';
  element.innerHTML = `<label for="${id}">${label}</label><select id="${id}"></select>`;
  const select = element.querySelector('select')!;
  for (const option of options) select.add(new Option(option.label, option.id));
  select.value = initial;
  select.addEventListener('change', () => onChange(select.value));
  return {
    element,
    setValue(value) {
      select.value = value;
    },
  };
}
