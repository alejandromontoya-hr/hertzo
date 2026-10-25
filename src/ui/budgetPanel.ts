import type { LinkBudget } from '../rf/linkBudget';
import { dbmToWatts } from '../rf/units';
import { formatDb, formatDbi, formatDbm, formatMHz, formatWatts } from './format';

/** Diferencias menores que esta se consideran un enlace balanceado (dB). */
const BALANCED_THRESHOLD_DB = 1;

interface Row {
  label: string;
  value: (b: LinkBudget) => string;
  strong?: boolean;
}

const ROWS: Row[] = [
  { label: 'Transmite', value: (b) => (b.direction === 'talk-out' ? 'Repetidora' : 'Radio') },
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
  },
  { label: 'Pérdidas al recibir', value: (b) => formatDb(b.rxLossesDb) },
  { label: 'Sensibilidad', value: (b) => formatDbm(b.sensitivityDbm) },
  { label: 'Pérdida de trayecto máxima', value: (b) => formatDb(b.maxPathLossDb), strong: true },
];

/** Frase que dice qué dirección limita la cobertura y por cuántos dB. */
export function balanceSummary(talkOut: LinkBudget, talkIn: LinkBudget): string {
  const diff = talkOut.maxPathLossDb - talkIn.maxPathLossDb;
  if (Math.abs(diff) < BALANCED_THRESHOLD_DB) {
    return `Bajada y subida están balanceadas (diferencia de ${formatDb(Math.abs(diff))}).`;
  }
  if (diff > 0) {
    return `La subida aguanta ${formatDb(diff)} menos de pérdida que la bajada: la cobertura la limita la subida (oyes la repetidora, pero ella no te oye).`;
  }
  return `La bajada aguanta ${formatDb(-diff)} menos de pérdida que la subida: la cobertura la limita la bajada (la repetidora te oye, pero tú no la oyes).`;
}

export function createBudgetPanel(container: HTMLElement): (talkOut: LinkBudget, talkIn: LinkBudget) => void {
  container.innerHTML = `
    <table class="budget">
      <thead><tr><th></th><th>Bajada</th><th>Subida</th></tr></thead>
      <tbody></tbody>
    </table>
    <p class="budget-summary"></p>`;
  const body = container.querySelector('tbody')!;
  const summary = container.querySelector<HTMLElement>('.budget-summary')!;

  const cells = ROWS.map((row) => {
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
      cell.out.textContent = cell.row.value(talkOut);
      cell.in.textContent = cell.row.value(talkIn);
    }
    summary.textContent = balanceSummary(talkOut, talkIn);
    // Solo se resalta como aviso cuando una dirección limita la cobertura.
    summary.classList.toggle(
      'balanced',
      Math.abs(talkOut.maxPathLossDb - talkIn.maxPathLossDb) < BALANCED_THRESHOLD_DB,
    );
  };
}
