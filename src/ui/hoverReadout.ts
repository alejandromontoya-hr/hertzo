import type { CoverageResult } from '../coverage/computeCoverage';
import { isLowConfidence } from '../coverage/colorScale';
import { gridIndexAt } from '../coverage/raster';
import { distanceM, type LonLat } from '../geo/geodesy';
import { marginDb, receivedPowerDbm, type LinkBudget } from '../rf/linkBudget';
import { formatDb, formatDbm } from './format';

const kmFormat = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Texto de la lectura en un punto, o null si está fuera del círculo de cálculo. */
export function readoutLines(
  coverage: CoverageResult,
  talkOut: LinkBudget,
  talkIn: LinkBudget,
  point: LonLat,
): string[] | null {
  const g = gridIndexAt(coverage.plan, point);
  if (g < 0) return null;
  const outLoss = coverage.talkOut.lossDb[g]!;
  const inLoss = coverage.talkIn.lossDb[g]!;
  const line = (name: string, budget: LinkBudget, loss: number) => {
    if (Number.isNaN(loss)) return `${name}: sin cálculo`;
    const margin = marginDb(budget, loss);
    return `${name}: ${formatDbm(receivedPowerDbm(budget, loss))} (margen ${margin >= 0 ? '+' : ''}${formatDb(margin)})`;
  };
  const lines = [
    `A ${kmFormat.format(distanceM(coverage.plan.site, point) / 1000)} km del sitio`,
    line('Bajada', talkOut, outLoss),
    line('Subida', talkIn, inLoss),
  ];
  if (isLowConfidence(coverage.talkOut.warnings[g]! | coverage.talkIn.warnings[g]!)) {
    lines.push('Baja confianza: ladera empinada junto al sitio');
  }
  return lines;
}

/** Cuadro que sigue al cursor sobre el mapa. */
export function createHoverReadout(root: HTMLElement) {
  return {
    show(lines: string[], x: number, y: number) {
      root.hidden = false;
      root.replaceChildren(
        ...lines.map((text, i) => {
          const p = document.createElement('p');
          p.textContent = text;
          if (i === 0) p.className = 'readout-title';
          if (text.startsWith('Baja confianza')) p.className = 'readout-warning';
          return p;
        }),
      );
      // Se coloca a la derecha y abajo del cursor; cerca de los bordes, al otro lado.
      const parent = root.parentElement!.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      const left = x + 14 + box.width > parent.width ? x - 14 - box.width : x + 14;
      const top = y + 14 + box.height > parent.height ? y - 14 - box.height : y + 14;
      root.style.transform = `translate(${left}px, ${top}px)`;
    },
    hide() {
      root.hidden = true;
    },
  };
}
