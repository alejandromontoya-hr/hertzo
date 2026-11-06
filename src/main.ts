import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './style.css';
import { inject } from '@vercel/analytics';
import { startRouter, type Route } from './pages/router';
import { CHOOSER_PATH, SCENARIOS } from './pages/scenarios';
import { pageMeta } from './seo/seo';
import { installInfoTips } from './ui/infoTip';

// Contador de visitas de Vercel Web Analytics: sin cookies ni datos personales. Fuera de
// Vercel (por ejemplo en desarrollo) no envía nada.
inject();

// Globo de los botones "i" de todas las páginas.
installInfoTips();

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
  { path: 'lora', title: titleOf('lora'), load: () => import('./pages/lora/loraPage').then((m) => m.mountLoraPage) },
];

const credits = document.getElementById('credits') as HTMLDialogElement;
/** Los créditos vienen en un <template>: así su texto legal en inglés no compite con el de la página en los buscadores. */
const showCredits = () => {
  const content = credits.querySelector<HTMLTemplateElement>('#credits-content');
  if (content) content.replaceWith(content.content.cloneNode(true));
  credits.showModal();
};
document.querySelector('[data-open-credits]')!.addEventListener('click', showCredits);
// La página principal enlaza los créditos como /escenarios#creditos.
if (location.hash === '#creditos') showCredits();

const crumbCurrent = document.querySelector<HTMLElement>('[data-crumb-current]')!;

// Texto propio de la página ("Acerca de esta simulación"): viene en el HTML para los
// buscadores y, al montar la app, queda al final del panel.
const about = document.querySelector<HTMLElement>('[data-page-about]');
about?.remove();

const app = document.getElementById('app')!;
void startRouter(app, routes, CHOOSER_PATH, (route) => {
  const isChooser = route.path === CHOOSER_PATH;
  crumbCurrent.textContent = isChooser ? '' : route.title;
  crumbCurrent.hidden = isChooser;
  // El mismo título que trae el <head> de la página, por si la dirección cambió (una 404 lleva a escenarios).
  document.title = pageMeta(route.path)!.title;
}).then(() => {
  if (about) app.querySelector('.panel')?.append(about);
});
