// Página principal (hertzo.site/): el contenido está en index.html; aquí se dibujan la carta de
// muestra y la lista de escenarios, que sale del mismo catálogo del simulador.

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { SCENARIOS } from './pages/scenarios';
import { SAMPLE_MAP_KEY, sampleCoverageMap } from './ui/sampleMap';

document.querySelector('[data-sample-map]')!.innerHTML = sampleCoverageMap();
document.querySelector('[data-sample-key]')!.innerHTML = SAMPLE_MAP_KEY;

document.querySelector('[data-scenarios]')!.innerHTML = SCENARIOS.map(
  (s) => `
  <li>
    <a href="/${s.path}">
      <span class="scenario-icon">${s.icon}</span>
      <span class="landing-scenario-text">
        <strong>${s.title}</strong>
        <small>${s.summary}</small>
      </span>
    </a>
  </li>`,
).join('');
