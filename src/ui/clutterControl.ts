// Menú "Entorno del equipo" y la altura de lo que lo rodea (UIT-R P.2108). Lo comparten
// LoRa y Terreno. La elección queda en la dirección: ?entorno=urbano&altura-entorno=6.

import type { CoverageRequest } from '../coverage/computeCoverage';
import { TALK_IN } from '../coverage/inputs';
import { CLUTTER_TYPES, clutterLossDb, type Clutter, type ClutterType } from '../rf/clutter';
import { createNumberField } from './fields';
import { infoButton } from './infoTip';

const NONE = 'ninguno';

/** Lee el entorno de la dirección; null si no hay o no se reconoce. */
export function parseClutter(params: URLSearchParams): Clutter | null {
  const info = CLUTTER_TYPES.find((t) => t.id === params.get('entorno'));
  if (!info) return null;
  const height = Number(params.get('altura-entorno'));
  return { type: info.id, heightM: Number.isFinite(height) && height >= 1 && height <= 100 ? height : info.heightM };
}

/** Lo que va en la dirección: la altura solo si no es la de la norma. */
export function clutterQuery(clutter: Clutter | null): { entorno: string | null; altura: string | null } {
  if (!clutter) return { entorno: null, altura: null };
  const standard = CLUTTER_TYPES.find((t) => t.id === clutter.type)!.heightM;
  return { entorno: clutter.type, altura: clutter.heightM === standard ? null : String(clutter.heightM) };
}

/** Nombre corto del entorno para la lectura y el KMZ: "urbano de 15 m". */
export function clutterLabel(clutter: Clutter): string {
  const label = CLUTTER_TYPES.find((t) => t.id === clutter.type)!.label;
  return `${label.charAt(0).toLowerCase()}${label.slice(1)}, ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(clutter.heightM)} m`;
}

export function createClutterControl(
  container: HTMLElement,
  initial: Clutter | null,
  onChange: (clutter: Clutter | null) => void,
): void {
  let clutter = initial;
  const field = document.createElement('div');
  field.className = 'field field-select';
  field.innerHTML = `<label for="entorno">Entorno del equipo${infoButton(
    'El relieve (SRTM) no trae edificios ni árboles: sin entorno, Hertzo calcula como si la ciudad estuviera vacía. Con entorno, suma lo que pierde el equipo por estar por debajo de lo que lo rodea, según la UIT-R P.2108. El relieve SRTM ya trae en parte los árboles y los edificios grandes: si el resultado se ve muy pesimista, baja la altura de lo que rodea al equipo.',
  )}</label><select id="entorno"><option value="${NONE}">Sin entorno (solo relieve)</option>${CLUTTER_TYPES.map(
    (t) => `<option value="${t.id}">${t.label}</option>`,
  ).join('')}</select>`;
  const select = field.querySelector('select')!;
  select.value = clutter?.type ?? NONE;

  const height = createNumberField(
    {
      key: 'clutterHeightM',
      label: 'Altura de lo que rodea al equipo',
      unit: 'm',
      min: 1,
      max: 100,
      hint: 'La norma usa 10 m en abierto y suburbano, 15 m en urbano y 20 m en urbano denso. Para casetas o bodegas, escribe la altura de sus techos.',
    },
    clutter?.heightM ?? 15,
    (value) => {
      if (!clutter) return;
      clutter = { ...clutter, heightM: value };
      onChange(clutter);
    },
  );
  height.element.hidden = !clutter;
  // Sin entorno el resultado sale optimista donde hay casas o árboles: se dice a la vista, con el dato medido.
  const noClutterHint = document.createElement('p');
  noClutterHint.className = 'hint';
  noClutterHint.textContent =
    'Solo relieve: en ciudad o zonas arboladas la señal real suele ser menor. En 320 mediciones a 10 m del banco de la UIT (Reino Unido, 150 a 1000 MHz), este cálculo dio en promedio 19 dB más que lo medido. Si el equipo está entre casas o árboles, elige su entorno.';
  noClutterHint.hidden = clutter !== null;
  container.append(field, noClutterHint, height.element);

  select.addEventListener('change', () => {
    const info = CLUTTER_TYPES.find((t) => t.id === (select.value as ClutterType));
    clutter = info ? { type: info.id, heightM: info.heightM } : null;
    if (clutter) height.setValue(clutter.heightM);
    height.element.hidden = !clutter;
    noClutterHint.hidden = clutter !== null;
    onChange(clutter);
  });
}

const dbFormat = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Lo que sumó el entorno: 22,35 → "+22,4 dB". */
export function formatClutterDb(db: number): string {
  return `+${dbFormat.format(db)} dB`;
}

/**
 * Entorno con el que se hizo un cálculo de cobertura y lo que sumó en subida, en los dos
 * extremos: "Entorno urbano o arbolado, 15 m: +22,4 dB". Null si se calculó sin entorno.
 */
export function clutterSummary(request: CoverageRequest): string | null {
  const clutter = request.engine.id === 'itm' ? request.engine.clutter : undefined;
  if (!clutter) return null;
  const link = request.links[TALK_IN] ?? request.links[0]!;
  const db = clutterLossDb(link.frequencyMHz, link.siteHeightM, clutter) + clutterLossDb(link.frequencyMHz, link.radioHeightM, clutter);
  return `Entorno ${clutterLabel(clutter)}: ${formatClutterDb(db)}`;
}
