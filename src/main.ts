import './style.css';
import { CoverageAbortedError, CoverageRunner, type CoverageResult } from './coverage/computeCoverage';
import { DEFAULT_LEVEL_THRESHOLDS_DBM } from './coverage/colorScale';
import { propagationInputs, sameInputs, type PropagationInputs } from './coverage/inputs';
import { buildRasterGeometry, type RasterGeometry } from './coverage/raster';
import { renderCoverage } from './coverage/render';
import { createCoverageLayer } from './map/coverageLayer';
import { createCoverageLegend, type LegendState } from './ui/coverageLegend';
import { createHoverReadout, readoutLines } from './ui/hoverReadout';
import {
  DEFAULT_RADIO_PROFILE_ID,
  DEFAULT_RADIUS_KM,
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
import { createCoverageStatus } from './ui/coverageStatus';
import { createNumberField } from './ui/fields';
import { createProfileChart } from './ui/profileChart';
import { createSitePanel } from './ui/sitePanel';

const map = createMap(document.getElementById('map')!);

const credits = document.getElementById('credits') as HTMLDialogElement;
document.querySelector('[data-open-credits]')!.addEventListener('click', () => credits.showModal());
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
    scheduleCoverage();
  },
  () => !profileMode,
);

// --- Parámetros y balance de enlace ---

let tx = DEFAULT_TX_CHAIN;
let rx = DEFAULT_RX_CHAIN;
let radio = RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;
let radiusKm = DEFAULT_RADIUS_KM;

const showBudget = createBudgetPanel(document.getElementById('budget')!);
const onParametersChange = () => {
  showBudget(talkOutBudget(tx, radio), talkInBudget(rx, radio));
  redrawCoverage();
  scheduleCoverage();
};

createRadioForm(document.getElementById('radio-form')!, radio, (next) => {
  radio = next;
  onParametersChange();
});
createTxForm(document.getElementById('tx-form')!, tx, (next) => {
  tx = next;
  onParametersChange();
});
createRxForm(document.getElementById('rx-form')!, rx, (next) => {
  rx = next;
  onParametersChange();
});
document.getElementById('radius-field')!.append(
  createNumberField(
    { key: 'radiusKm', label: 'Radio de cálculo', unit: 'km', min: 1, max: 100 },
    radiusKm,
    (value) => {
      radiusKm = value;
      onParametersChange();
    },
  ).element,
);

// --- Cálculo de cobertura ---

/** Espera tras el último cambio antes de recalcular, para no lanzar un cálculo por tecla. */
const COVERAGE_DEBOUNCE_MS = 400;

const coverageRunner = new CoverageRunner();
const coverageStatus = createCoverageStatus(document.getElementById('coverage-status')!);
let coverage: CoverageResult | null = null;
let coverageInputs: PropagationInputs | null = null;
let coverageAbort: AbortController | null = null;
let coverageTimer: ReturnType<typeof setTimeout> | undefined;

/** Recalcula solo si cambió algo que afecta la propagación (sitio, alturas, frecuencias, radio). */
function scheduleCoverage() {
  if (!site) return;
  const inputs = propagationInputs(site, radiusKm * 1000, tx, rx, radio);
  if (sameInputs(coverageInputs, inputs)) return;
  coverageInputs = inputs;
  clearTimeout(coverageTimer);
  coverageTimer = setTimeout(() => void runCoverage(inputs), COVERAGE_DEBOUNCE_MS);
}

async function runCoverage(inputs: PropagationInputs) {
  coverageAbort?.abort();
  const abort = new AbortController();
  coverageAbort = abort;
  try {
    const result = await coverageRunner.run(inputs, coverageStatus.showProgress, abort.signal);
    coverage = result;
    rasterGeometry = buildRasterGeometry(result.plan);
    rasterPixels = new Uint8ClampedArray(rasterGeometry.width * rasterGeometry.height * 4);
    redrawCoverage();
    coverageStatus.showDone(result);
    if (import.meta.env.DEV) Object.assign(window, { hertzoCoverage: coverage });
  } catch (error) {
    if (error instanceof CoverageAbortedError) return;
    console.error(error);
    coverageInputs = null; // permite reintentar con los mismos datos
    coverageStatus.showError(error instanceof Error ? error.message : String(error));
  }
}

// --- Mapas de bajada, subida y desbalance ---

let legendState: LegendState = { view: 'talkOut', thresholdsDbm: [...DEFAULT_LEVEL_THRESHOLDS_DBM], opacity: 0.7 };
let rasterGeometry: RasterGeometry | null = null;
let rasterPixels: Uint8ClampedArray<ArrayBuffer> | null = null;

const coverageLayer = createCoverageLayer(map, legendState.opacity);
const legend = createCoverageLegend(document.getElementById('coverage-legend')!, legendState, (next) => {
  const onlyOpacity =
    next.view === legendState.view && next.thresholdsDbm.join() === legendState.thresholdsDbm.join();
  legendState = next;
  coverageLayer.setOpacity(next.opacity);
  if (!onlyOpacity) redrawCoverage();
});

/** Vuelve a pintar el mapa visible con el último cálculo y el balance actual (sin recalcular). */
function redrawCoverage() {
  if (!coverage || !rasterGeometry || !rasterPixels) return;
  const down = talkOutBudget(tx, radio);
  const up = talkInBudget(rx, radio);
  renderCoverage(rasterGeometry, coverage, legendState.view, down, up, legendState.thresholdsDbm, rasterPixels);
  coverageLayer.draw(rasterGeometry, rasterPixels);
  legend.update(legendState, legendState.view === 'talkIn' ? up.sensitivityDbm : down.sensitivityDbm);
}

const hoverReadout = createHoverReadout(document.getElementById('hover-readout')!);
map.on('mousemove', (event) => {
  const lines =
    coverage &&
    readoutLines(coverage, talkOutBudget(tx, radio), talkInBudget(rx, radio), {
      lon: event.lngLat.lng,
      lat: event.lngLat.lat,
    });
  if (lines) hoverReadout.show(lines, event.point.x, event.point.y);
  else hoverReadout.hide();
});
map.on('mouseout', () => hoverReadout.hide());

onParametersChange();
