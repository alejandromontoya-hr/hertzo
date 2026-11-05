// Selector de escenarios: el usuario elige qué quiere simular. La presentación de Hertzo vive
// en la página principal (/); aquí se va directo a trabajar.

import type { PageContext } from './router';
import { SCENARIO_ICONS } from '../ui/icons';
import { SCENARIO_GROUPS, SCENARIOS, type Scenario } from './scenarios';

export function mountHomePage({ root }: PageContext): void {
  root.innerHTML = `
    <div class="home">
      <header class="chooser-head">
        <h1>¿Qué quieres simular?</h1>
        <p>Elige un escenario o entra directo a una de sus variantes.</p>
      </header>
      ${SCENARIO_GROUPS.map(
        (g) => `
      <section class="home-list scenario-group" aria-labelledby="grupo-${g.id}">
        <h2 class="scenario-group-title" id="grupo-${g.id}">${g.title}</h2>
        <ul class="scenario-grid">
          ${SCENARIOS.filter((s) => s.group === g.id).map(scenarioCard).join('')}
        </ul>
      </section>`,
      ).join('')}
    </div>`;
}

/** Tarjeta de un escenario; la "Hoja" sigue el orden del catálogo completo, no el del grupo. */
function scenarioCard(s: Scenario): string {
  const sheet = String(SCENARIOS.indexOf(s) + 1).padStart(2, '0');
  return `
            <li class="scenario-card">
              <a class="scenario-main" href="/${s.path}">
                <span class="scenario-head">
                  <span class="scenario-icon">${SCENARIO_ICONS[s.path]}</span>
                  <span class="scenario-sheet">Hoja ${sheet}</span>
                </span>
                <span class="scenario-title">${s.title}</span>
                <span class="scenario-summary">${s.summary}</span>
                <span class="scenario-computes">${s.computes}</span>
              </a>
              <div class="scenario-options" aria-label="Variantes de ${s.title}">
                ${s.options.map((o) => `<a class="chip" href="${o.href}">${o.label}</a>`).join('')}
              </div>
              <p class="scenario-model">Modelo: ${s.model}</p>
            </li>`;
}
