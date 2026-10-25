// Lista de escenarios de la página principal. La compilación la escribe en index.html, así los
// buscadores y los asistentes de IA que no ejecutan JavaScript ven los seis escenarios y sus
// enlaces; al cargar, landing.ts la vuelve a escribir igual pero con los íconos.

import { SCENARIOS } from './pages/scenarios';

/** `icon` da el SVG de cada escenario por su dirección; sin íconos, el círculo queda vacío. */
export function landingScenarioList(icon: (path: string) => string = () => ''): string {
  return SCENARIOS.map(
    (s) => `
  <li>
    <a href="/${s.path}">
      <span class="scenario-icon">${icon(s.path)}</span>
      <span class="landing-scenario-text">
        <strong>${s.title}</strong>
        <small>${s.summary}</small>
      </span>
    </a>
  </li>`,
  ).join('');
}
