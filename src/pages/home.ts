// Portada: el usuario elige qué quiere simular.

import type { PageContext } from './router';
import { SCENARIO_ICONS } from '../ui/icons';
import { SAMPLE_MAP_KEY, sampleCoverageMap } from '../ui/sampleMap';
import { SCENARIOS } from './scenarios';

export function mountHomePage({ root }: PageContext): void {
  const first = SCENARIOS[0]!;
  const firstOption = first.options[1] ?? first.options[0]!;
  root.innerHTML = `
    <div class="home">
      <section class="home-hero">
        <div class="home-hero-text">
          <p class="eyebrow">Simulador abierto de propagación RF</p>
          <h1>¿Qué quieres simular?</h1>
          <p class="home-hero-lead">
            Cada escenario tiene su propia página, con el modelo de propagación y el entorno que le
            corresponden: no se simula igual una repetidora en la montaña que un WiFi en una casa o
            una radio dentro de una mina.
          </p>
          <div class="home-actions">
            <a class="pill pill-solid" href="${firstOption.href}">Empezar en terreno · ${firstOption.label}</a>
            <a class="pill" href="#escenarios">Ver los ${SCENARIOS.length} escenarios ↓</a>
          </div>
        </div>
        <figure class="hero-map">
          <div class="hero-map-frame">${sampleCoverageMap()}</div>
          <figcaption>
            <span>Ejemplo ilustrativo · bajada de un sitio UHF</span>
            <span class="hero-map-key">${SAMPLE_MAP_KEY}</span>
          </figcaption>
        </figure>
      </section>
      <section class="home-list" id="escenarios">
        <div class="home-list-head">
          <h2>Escenarios</h2>
          <span>${SCENARIOS.length} hojas · todo corre en tu navegador</span>
        </div>
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
