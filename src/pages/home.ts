// Portada: el usuario elige qué quiere simular.

import type { PageContext } from './router';
import { SCENARIOS } from './scenarios';

export function mountHomePage({ root }: PageContext): void {
  root.innerHTML = `
    <div class="home">
      <section class="home-hero">
        <h1>¿Qué quieres simular?</h1>
        <p>
          Cada escenario tiene su propia página, con el modelo de propagación y el entorno que le
          corresponden: no se simula igual una repetidora en la montaña que un WiFi en una casa o
          una radio dentro de una mina.
        </p>
      </section>
      <ul class="scenario-grid">
        ${SCENARIOS.map(
          (s) => `
          <li class="scenario-card">
            <a class="scenario-main" href="/${s.path}">
              <span class="scenario-icon">${s.icon}</span>
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
    </div>`;
}
