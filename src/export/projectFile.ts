// Archivo de proyecto (.json) de los simuladores con editor: guardar el trabajo y abrirlo en
// otro equipo. Módulo puro: cada simulador dice cómo leer y revisar sus propios datos.

export type ProjectScenario = 'interiores' | 'cavernas';

const SCENARIO_NAMES: Record<ProjectScenario, string> = { interiores: 'Interiores', cavernas: 'Cavernas' };

/** Versión del formato; sube cuando un cambio impide que una versión vieja de Hertzo lo lea. */
export const PROJECT_VERSION = 1;

export type ParseResult<T> = { ok: true; data: T } | { ok: false; message: string };

/** Fecha local AAAA-MM-DD, para el nombre del archivo. */
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Contenido del archivo: quién lo hizo, de qué simulador, cuándo y los datos. */
export function projectJson(scenario: ProjectScenario, data: unknown, now: Date): string {
  return JSON.stringify({ app: 'hertzo', scenario, version: PROJECT_VERSION, savedAt: now.toISOString(), data }, null, 2);
}

/** Por ejemplo hertzo-interiores-2026-10-26.json. */
export function projectFileName(scenario: ProjectScenario, now: Date): string {
  return `hertzo-${scenario}-${isoDate(now)}.json`;
}

/**
 * Lee un archivo de proyecto. `read` revisa los datos del simulador y devuelve una copia limpia,
 * o null si falta algo; en ese caso el mensaje dice qué pasó y la página no cambia nada.
 */
export function parseProject<T>(text: string, scenario: ProjectScenario, read: (data: unknown) => T | null): ParseResult<T> {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, message: 'El archivo no es un proyecto de Hertzo: no se pudo leer.' };
  }
  if (!isRecord(file) || file.app !== 'hertzo') return { ok: false, message: 'El archivo no es un proyecto de Hertzo.' };
  if (file.scenario !== scenario) {
    const other = SCENARIO_NAMES[file.scenario as ProjectScenario];
    return {
      ok: false,
      message: other
        ? `Es un proyecto de ${other}: ábrelo en esa página.`
        : `El archivo no es un proyecto de ${SCENARIO_NAMES[scenario]}.`,
    };
  }
  if (typeof file.version !== 'number' || file.version > PROJECT_VERSION) {
    return { ok: false, message: 'El proyecto es de una versión más nueva de Hertzo: recarga la página e inténtalo de nuevo.' };
  }
  const data = read(file.data);
  if (!data) return { ok: false, message: `El proyecto de ${SCENARIO_NAMES[scenario]} está incompleto o dañado; no se cambió nada.` };
  return { ok: true, data };
}

// --- Revisión de datos, para los lectores de cada simulador ---

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Lista donde cada elemento pasa por `read`; null si no es lista o si alguno no sirve. */
export function readList<T>(v: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out: T[] = [];
  for (const item of v) {
    const value = read(item);
    if (value === null) return null;
    out.push(value);
  }
  return out;
}

/** Lista de números finitos de un largo dado (por ejemplo, los umbrales). */
export function readNumbers(v: unknown, length: number): number[] | null {
  const list = readList(v, (n) => (isFiniteNumber(n) ? n : null));
  return list && list.length === length ? list : null;
}
