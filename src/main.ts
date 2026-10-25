import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { inject } from '@vercel/analytics';
import { startRouter, type Route } from './pages/router';
import { CHOOSER_PATH, SCENARIOS } from './pages/scenarios';

// Contador de visitas de Vercel Web Analytics: sin cookies ni datos personales. Fuera de
// Vercel (por ejemplo en desarrollo) no envía nada.
inject();

const titleOf = (path: string) => SCENARIOS.find((s) => s.path === path)!.title;

const routes: Route[] = [
  { path: CHOOSER_PATH, title: 'Escenarios', load: () => import('./pages/home').then((m) => m.mountHomePage) },
  { path: 'terreno', title: titleOf('terreno'), load: () => import('./pages/terrain/lmrPage').then((m) => m.mountLmrPage) },
  {
    path: 'radiodifusion',
    title: titleOf('radiodifusion'),
    load: () => import('./pages/broadcast/broadcastPage').then((m) => m.mountBroadcastPage),
  },
  {
    path: 'celular',
    title: titleOf('celular'),
    load: () => import('./pages/cellular/cellularPage').then((m) => m.mountCellularPage),
  },
  { path: 'enlace', title: titleOf('enlace'), load: () => import('./pages/link/linkPage').then((m) => m.mountLinkPage) },
  {
    path: 'interiores',
    title: titleOf('interiores'),
    load: () => import('./pages/indoor/indoorPage').then((m) => m.mountIndoorPage),
  },
  { path: 'cavernas', title: titleOf('cavernas'), load: () => import('./pages/cave/cavePage').then((m) => m.mountCavePage) },
];

const credits = document.getElementById('credits') as HTMLDialogElement;
document.querySelector('[data-open-credits]')!.addEventListener('click', () => credits.showModal());
// La página principal enlaza los créditos como /escenarios#creditos.
if (location.hash === '#creditos') credits.showModal();

const crumbCurrent = document.querySelector<HTMLElement>('[data-crumb-current]')!;

void startRouter(document.getElementById('app')!, routes, CHOOSER_PATH, (route) => {
  const isChooser = route.path === CHOOSER_PATH;
  crumbCurrent.textContent = isChooser ? '' : route.title;
  crumbCurrent.hidden = isChooser;
  document.title = isChooser ? 'Hertzo · Simulador de propagación RF' : `${route.title} · Hertzo`;
});
