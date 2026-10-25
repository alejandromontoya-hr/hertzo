// Portada: el usuario elige qué quiere simular.

import type { PageContext } from './router';
import { SCENARIOS } from './scenarios';

/** Contorno cerrado irregular alrededor de (cx, cy): una curva de nivel o de señal de muestra. */
function contour(cx: number, cy: number, radius: number, phase: number, detail: number): string {
  const steps = 120;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const g =
      1 +
      0.2 * Math.sin(t + 0.6 * phase) +
      0.16 * Math.sin(2 * t + 1.7 * phase) +
      0.1 * Math.sin(3 * t + phase) +
      detail * (0.07 * Math.sin(5 * t + 2.3 * phase) + 0.05 * Math.sin(9 * t + 2 * phase) + 0.03 * Math.sin(17 * t + 3 * phase));
    d += `${i === 0 ? 'M' : 'L'}${(cx + radius * g * Math.cos(t)).toFixed(1)} ${(cy + radius * g * Math.sin(t)).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** Carta topográfica ilustrativa de la portada: relieve y franjas de señal de un sitio de muestra. */
function heroMap(): string {
  const topo: string[] = [];
  const index: string[] = [];
  const hills: [number, number, number, number][] = [
    [300, 236, 0.4, 12],
    [500, 90, 2.1, 7],
    [90, 380, 1.4, 8],
    [520, 420, 2.9, 6],
  ];
  for (const [x, y, phase, count] of hills) {
    for (let i = 1; i <= count; i++) (i % 4 === 0 ? index : topo).push(contour(x, y, 16 * i, phase + i * 0.09, 1.5));
  }
  const bands = [
    { r: 215, k: 1, fill: '#fed98e', opacity: 0.55, stroke: '#c47a1a' },
    { r: 158, k: 1.2, fill: '#fe9929', opacity: 0.45, stroke: '#b4600e' },
    { r: 104, k: 1.4, fill: '#d95f0e', opacity: 0.5, stroke: '#8c3b07' },
    { r: 52, k: 1.6, fill: '#8c2d04', opacity: 0.6, stroke: '#5e1e02' },
  ];
  return `
    <svg viewBox="0 0 606 470" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="${topo.join('')}" fill="none" stroke="#cdbfa0" stroke-width="0.9"/>
      <path d="${index.join('')}" fill="none" stroke="#b8a67f" stroke-width="1.5"/>
      <path d="M120 0C100 90 150 170 118 250S80 380 150 470" fill="none" stroke="#6f97b8" stroke-width="2.2"/>
      ${bands
        .map(
          (b, i) =>
            `<path d="${contour(303, 240, b.r, 1.3 + i * 0.02, b.k)}" fill="${b.fill}" fill-opacity="${b.opacity}" stroke="${b.stroke}"/>`,
        )
        .join('')}
      <circle cx="303" cy="240" r="7" fill="#fbfaf6" stroke="#1f2328" stroke-width="2"/>
      <path d="M560 34 568 54 560 49 552 54Z" fill="#1f2328"/>
      <text x="556" y="28" class="hero-map-label">N</text>
    </svg>`;
}

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
          <div class="hero-map-frame">${heroMap()}</div>
          <figcaption>
            <span>Ejemplo ilustrativo · bajada de un sitio UHF</span>
            <span class="hero-map-key">
              <i style="background:#8c2d04"></i>≥ −80 <i style="background:#d95f0e"></i>−95
              <i style="background:#fe9929"></i>−105 <i style="background:#fed98e"></i>−116 dBm
            </span>
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
                  <span class="scenario-icon">${s.icon}</span>
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
