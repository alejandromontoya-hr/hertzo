import './style.css';
import {
  DEFAULT_RADIO_PROFILE_ID,
  DEFAULT_RX_CHAIN,
  DEFAULT_TX_CHAIN,
  RADIO_PROFILES,
} from './data/defaults';
import type { LonLat } from './geo/geodesy';
import { createMap } from './map/map';
import { createProfileTool } from './map/profileTool';
import { enableSitePlacement } from './map/siteMarker';
import { talkInBudget, talkOutBudget } from './rf/linkBudget';
import { loadTerrain } from './terrain/elevation';
import { profileBounds, sampleProfile } from './terrain/profile';
import { createBudgetPanel } from './ui/budgetPanel';
import { createRadioForm, createRxForm, createTxForm } from './ui/chainForms';
import { createProfileChart } from './ui/profileChart';
import { createSitePanel } from './ui/sitePanel';

const map = createMap(document.getElementById('map')!);
// Solo en desarrollo: acceso al mapa desde la consola para pruebas manuales.
if (import.meta.env.DEV) Object.assign(window, { hertzoMap: map });

// --- Sitio y perfil del terreno ---

let site: LonLat | null = null;
let profileTarget: LonLat | null = null;
let profileMode = false;
let profileRequest = 0;

const sitePanel = createSitePanel(document.getElementById('site-panel')!, () =>
  setProfileMode(!profileMode),
);
const profileTool = createProfileTool(
  map,
  (target) => {
    profileTarget = target;
    void updateProfile();
  },
  () => profileMode,
);
const profileChart = createProfileChart(
  document.getElementById('profile-chart')!,
  (point) => profileTool.setHover(point),
  () => setProfileMode(false),
);

function setProfileMode(active: boolean) {
  profileMode = active;
  sitePanel.setProfileMode(active);
  if (!active) {
    profileRequest++;
    profileTarget = null;
    profileTool.clear();
    profileChart.hide();
  }
}

async function updateProfile() {
  if (!site || !profileTarget) return;
  const from = site;
  const to = profileTarget;
  const current = ++profileRequest;
  profileTool.setLine(from, to);
  profileChart.showLoading();
  try {
    const sampler = await loadTerrain(profileBounds(from, to));
    if (current === profileRequest) profileChart.show(sampleProfile(sampler, from, to));
  } catch (error) {
    console.error(error);
    if (current === profileRequest) profileChart.showError('No se pudo descargar el terreno.');
  }
}

enableSitePlacement(
  map,
  (next) => {
    site = next;
    sitePanel.showSite(next);
    void updateProfile();
  },
  () => !profileMode,
);

// --- Parámetros y balance de enlace ---

let tx = DEFAULT_TX_CHAIN;
let rx = DEFAULT_RX_CHAIN;
let radio = RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;

const showBudget = createBudgetPanel(document.getElementById('budget')!);
const updateBudget = () => showBudget(talkOutBudget(tx, radio), talkInBudget(rx, radio));

createRadioForm(document.getElementById('radio-form')!, radio, (next) => {
  radio = next;
  updateBudget();
});
createTxForm(document.getElementById('tx-form')!, tx, (next) => {
  tx = next;
  updateBudget();
});
createRxForm(document.getElementById('rx-form')!, rx, (next) => {
  rx = next;
  updateBudget();
});
updateBudget();
