// Página principal (hertzo.site/): el contenido está en index.html; aquí se dibujan la carta de
// muestra y los íconos de la lista de escenarios, que sale del mismo catálogo del simulador.

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { inject } from '@vercel/analytics';
import { landingScenarioList } from './landingList';
import { GITHUB_ICON, LINKEDIN_ICON, SCENARIO_ICONS } from './ui/icons';
import { SAMPLE_MAP_KEY, sampleCoverageMap } from './ui/sampleMap';

// Contador de visitas de Vercel Web Analytics: sin cookies ni datos personales. Fuera de
// Vercel (por ejemplo en desarrollo) no envía nada.
inject();

document.querySelector('[data-sample-map]')!.innerHTML = sampleCoverageMap();
document.querySelector('[data-sample-key]')!.innerHTML = SAMPLE_MAP_KEY;

document.querySelector('[data-scenarios]')!.innerHTML = landingScenarioList((path) => SCENARIO_ICONS[path]!);

// Ícono delante de cada enlace a GitHub y a LinkedIn.
const BRAND_ICONS: Record<string, string> = { github: GITHUB_ICON, linkedin: LINKEDIN_ICON };
for (const link of document.querySelectorAll<HTMLElement>('[data-brand]')) {
  link.insertAdjacentHTML('afterbegin', BRAND_ICONS[link.dataset.brand!] ?? '');
}
