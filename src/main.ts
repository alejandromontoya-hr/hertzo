import './style.css';
import { startRouter, type Route } from './pages/router';
import { SCENARIOS } from './pages/scenarios';

const titleOf = (path: string) => SCENARIOS.find((s) => s.path === path)!.title;

const routes: Route[] = [
  { path: '', title: 'Escenarios', load: () => import('./pages/home').then((m) => m.mountHomePage) },
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
];

const credits = document.getElementById('credits') as HTMLDialogElement;
document.querySelector('[data-open-credits]')!.addEventListener('click', () => credits.showModal());

const crumbCurrent = document.querySelector<HTMLElement>('[data-crumb-current]')!;

startRouter(document.getElementById('app')!, routes, (route) => {
  const isHome = route.path === '';
  crumbCurrent.textContent = isHome ? '' : route.title;
  crumbCurrent.hidden = isHome;
  document.title = isHome ? 'Hertzo · Simulador de propagación RF' : `${route.title} · Hertzo`;
});
