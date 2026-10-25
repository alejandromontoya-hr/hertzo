// Selector de escenarios: el usuario elige qué quiere simular. La presentación de Hertzo vive
// en la página principal (/); aquí se va directo a trabajar.

import type { PageContext } from './router';
import { SCENARIO_ICONS } from '../ui/icons';
import { SCENARIOS } from './scenarios';

export function mountHomePage({ root }: PageContext): void {
  root.innerHTML = `
    <div class="home">
      <header class="chooser-head">
        <h1>¿Qué quieres simular?</h1>
        <p>Elige un escenario o entra directo a una de sus variantes.</p>
      </header>
      <section class="home-list" aria-label="Escenarios">
        <ul class="scenario-grid">
          ${SCENARIOS.map(
            (s, i) => `
            <li class="scenario-card">
              <a class="scenario-main" href="/${s.path}">
                <span class="scenario-head">
                  <span class="scenario-icon">${SCENARIO_ICONS[s.path]}</span>
                  <span class="scenario-sheet">Hoja ${String(i + 1).padStart(2, '0')}</span>
                </span>
                <span class="scenario-title">${s.title}</span>
                <span class="scenario-summary">${s.summary}</span>
                <span class="scenario-computes">${s.computes}</span>
              </a>
              <div class="scenario-options" aria-label="Variantes de ${s.title}">
                ${s.options.map((o) => `<a class="chip" href="${o.href}">${o.label}</a>`).join('')}
              </div>
              <p class="scenario-model">Modelo: ${s.model}</p>
            </li>`,
          ).join('')}
        </ul>
      </section>
    </div>`;
}
