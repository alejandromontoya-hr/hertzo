import type { LinkBudget } from '../rf/linkBudget';
import { dbmToWatts } from '../rf/units';
import { formatDb, formatDbi, formatDbm, formatMHz, formatWatts } from './format';

/** Diferencias menores que esta se consideran un enlace balanceado (dB). */
const BALANCED_THRESHOLD_DB = 1;

/** Cómo se llaman el sitio y el usuario en cada página, y qué filas aplican. */
export interface BudgetNames {
  site: string;
  user: string;
  /** Qué pasa cuando limita la subida y cuando limita la bajada, en palabras del usuario. */
  upLimited: string;
  downLimited: string;
  /** Muestra la fila del amplificador de torre. */
  towerAmplifier: boolean;
}

export const LMR_BUDGET_NAMES: BudgetNames = {
  site: 'Repetidora',
  user: 'Radio',
  upLimited: 'oyes la repetidora, pero ella no te oye',
  downLimited: 'la repetidora te oye, pero tú no la oyes',
  towerAmplifier: true,
};

export const LORA_BUDGET_NAMES: BudgetNames = {
  site: 'Gateway',
  user: 'Sensor',
  upLimited: 'el sensor oye al gateway, pero el gateway no lo oye',
  downLimited: 'el gateway oye al sensor, pero el sensor no lo oye',
  towerAmplifier: false,
};

interface Row {
  label: string;
  value: (b: LinkBudget, names: BudgetNames) => string;
  strong?: boolean;
  towerAmplifier?: boolean;
}

const ROWS: Row[] = [
  { label: 'Transmite', value: (b, names) => (b.direction === 'talk-out' ? names.site : names.user) },
  { label: 'Frecuencia', value: (b) => formatMHz(b.frequencyMHz) },
  {
    label: 'Potencia',
    value: (b) => `${formatDbm(b.txPowerDbm)} (${formatWatts(dbmToWatts(b.txPowerDbm))})`,
  },
  { label: 'Pérdidas al transmitir', value: (b) => formatDb(b.txLossesDb) },
  { label: 'Antena al transmitir', value: (b) => formatDbi(b.txAntennaGainDbi) },
  { label: 'ERP', value: (b) => formatDbm(b.erpDbm), strong: true },
  { label: 'PIRE', value: (b) => formatDbm(b.eirpDbm) },
  { label: 'Antena al recibir', value: (b) => formatDbi(b.rxAntennaGainDbi) },
  {
    label: 'Amplificador de torre',
    value: (b) => (b.direction === 'talk-in' ? formatDb(b.rxGainsDb) : '—'),
    towerAmplifier: true,
  },
  { label: 'Pérdidas al recibir', value: (b) => formatDb(b.rxLossesDb) },
  { label: 'Sensibilidad', value: (b) => formatDbm(b.sensitivityDbm) },
  { label: 'Pérdida de trayecto máxima', value: (b) => formatDb(b.maxPathLossDb), strong: true },
];

const rowsFor = (names: BudgetNames) => ROWS.filter((row) => !row.towerAmplifier || names.towerAmplifier);

/** Filas del balance como texto, igual que en el panel: etiqueta, bajada y subida. */
export function budgetRows(talkOut: LinkBudget, talkIn: LinkBudget, names: BudgetNames = LMR_BUDGET_NAMES): string[][] {
  return rowsFor(names).map((row) => [row.label, row.value(talkOut, names), row.value(talkIn, names)]);
}

/** Frase que dice qué dirección limita la cobertura y por cuántos dB. */
export function balanceSummary(talkOut: LinkBudget, talkIn: LinkBudget, names: BudgetNames = LMR_BUDGET_NAMES): string {
  const diff = talkOut.maxPathLossDb - talkIn.maxPathLossDb;
  if (Math.abs(diff) < BALANCED_THRESHOLD_DB) {
    return `Bajada y subida están balanceadas (diferencia de ${formatDb(Math.abs(diff))}).`;
  }
  if (diff > 0) {
    return `La subida aguanta ${formatDb(diff)} menos de pérdida que la bajada: la cobertura la limita la subida (${names.upLimited}).`;
  }
  return `La bajada aguanta ${formatDb(-diff)} menos de pérdida que la subida: la cobertura la limita la bajada (${names.downLimited}).`;
}

export function createBudgetPanel(
  container: HTMLElement,
  names: BudgetNames = LMR_BUDGET_NAMES,
): (talkOut: LinkBudget, talkIn: LinkBudget) => void {
  container.innerHTML = `
    <table class="budget">
      <thead><tr><th></th><th>Bajada</th><th>Subida</th></tr></thead>
      <tbody></tbody>
    </table>
    <p class="budget-summary"></p>`;
  const body = container.querySelector('tbody')!;
  const summary = container.querySelector<HTMLElement>('.budget-summary')!;

  const cells = rowsFor(names).map((row) => {
    const tr = body.insertRow();
    if (row.strong) tr.className = 'strong';
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = row.label;
    tr.append(th);
    return { row, out: tr.insertCell(), in: tr.insertCell() };
  });

  return (talkOut, talkIn) => {
    for (const cell of cells) {
      cell.out.textContent = cell.row.value(talkOut, names);
      cell.in.textContent = cell.row.value(talkIn, names);
    }
    // La frase no trae HTML; solo se resalta qué dirección limita la cobertura.
    summary.innerHTML = balanceSummary(talkOut, talkIn, names).replace(/la cobertura la limita la (subida|bajada)/, '<strong>$&</strong>');
  };
}
