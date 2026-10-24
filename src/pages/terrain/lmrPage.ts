// Radiocomunicaciones en terreno abierto (LMR): trunking P25, convencional, SmartZone.
// Un sitio con cadena de transmisión (bajada) y de recepción (subida), perfiles de radio y
// tres mapas: bajada, subida y desbalance.

import { BALANCE_LEGEND, DEFAULT_LEVEL_THRESHOLDS_DBM, LEVEL_COLORS, levelBandLabels } from '../../coverage/colorScale';
import type { CoverageResult } from '../../coverage/computeCoverage';
import { TALK_IN, TALK_OUT, lmrCoverageRequest } from '../../coverage/inputs';
import { buildRasterGeometry, type RasterGeometry } from '../../coverage/raster';
import { renderCoverage, type CoverageView } from '../../coverage/render';
import {
  DEFAULT_RADIO_PROFILE_ID,
  DEFAULT_RADIUS_KM,
  LMR_BANDS,
  RADIO_PROFILES,
  type LmrBandId,
} from '../../data/defaults';
import { createCoverageLayer } from '../../map/coverageLayer';
import { talkInBudget, talkOutBudget } from '../../rf/linkBudget';
import { createBudgetPanel } from '../../ui/budgetPanel';
import { createRadioForm, createRxForm, createTxForm } from '../../ui/chainForms';
import { createMapLegend } from '../../ui/coverageLegend';
import { createHoverReadout, readoutLines } from '../../ui/hoverReadout';
import { replaceQuery, type PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindSegmented, coverageStatusHtml, createMapPage, segmentedHtml, siteSectionHtml } from '../shared/mapPage';
import { createSiteControls } from '../shared/siteControls';

const VIEWS: { id: CoverageView; label: string; title: string }[] = [
  { id: 'talkOut', label: 'Bajada', title: 'Nivel recibido en el radio (dBm)' },
  { id: 'talkIn', label: 'Subida', title: 'Nivel recibido en el sitio (dBm)' },
  { id: 'balance', label: 'Desbalance', title: 'Dónde llega cada dirección' },
];

export function mountLmrPage({ root, params }: PageContext): () => void {
  const initialBand = LMR_BANDS.find((b) => b.id === params.get('banda')) ?? LMR_BANDS.find((b) => b.id === '800')!;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Radiocomunicaciones en terreno</h2>
      <p class="hint">Trunking P25, SmartZone y convencional. Bajada y subida por separado, cada una con su frecuencia y su cadena.</p>
      ${segmentedHtml('banda', LMR_BANDS.map((b) => ({ id: b.id, label: b.label })), 'Banda')}
      <p class="hint" data-band-range></p>
    </section>
    ${siteSectionHtml()}
    ${coverageStatusHtml()}
    <details class="panel-section" open>
      <summary>Radio de usuario</summary>
      <div class="form" data-radio-form></div>
    </details>
    <details class="panel-section">
      <summary>Bajada (talk-out) · cadena de transmisión</summary>
      <div class="form" data-tx-form></div>
    </details>
    <details class="panel-section">
      <summary>Subida (talk-in) · cadena de recepción</summary>
      <div class="form" data-rx-form></div>
    </details>
    <section class="panel-section">
      <h2>Balance de enlace</h2>
      <div data-budget></div>
    </section>`,
    'Parámetros del sitio de radio',
  );

  let band = initialBand;
  let tx = band.tx;
  let rx = band.rx;
  let radio = RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;
  let view: CoverageView = 'talkOut';
  let thresholds = [...DEFAULT_LEVEL_THRESHOLDS_DBM];
  let opacity = 0.7;
  let coverage: CoverageResult | null = null;
  let geometry: RasterGeometry | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const bandRange = page.find('[data-band-range]');
  const showBandRange = () => (bandRange.textContent = `Banda ${band.label}: ${band.range}.`);
  showBandRange();

  const showBudget = createBudgetPanel(page.find('[data-budget]'));
  const coverageLayer = createCoverageLayer(page.map, opacity);
  const legend = createMapLegend(page.legendRoot, {
    onView(id) {
      view = id as CoverageView;
      redraw();
    },
    onThresholds(values) {
      thresholds = values;
      redraw();
    },
    onOpacity(value) {
      opacity = value;
      coverageLayer.setOpacity(value);
    },
  });

  const site = createSiteControls(page, { radiusKm: DEFAULT_RADIUS_KM, maxRadiusKm: 100, onChange: onParametersChange });
  const controller = createCoverageController(
    page.find('[data-coverage-status]'),
    (result) => {
      coverage = result;
      geometry = buildRasterGeometry(result.plan);
      pixels = new Uint8ClampedArray(geometry.width * geometry.height * 4);
      redraw();
    },
    'bajada y subida',
  );

  createRadioForm(page.find('[data-radio-form]'), radio, (next) => {
    radio = next;
    onParametersChange();
  });
  const txForm = createTxForm(page.find('[data-tx-form]'), tx, (next) => {
    tx = next;
    onParametersChange();
  });
  const rxForm = createRxForm(page.find('[data-rx-form]'), rx, (next) => {
    rx = next;
    onParametersChange();
  });
  bindSegmented(page.panel, 'banda', band.id, (id) => {
    band = LMR_BANDS.find((b) => b.id === (id as LmrBandId))!;
    // Se conservan las alturas y la potencia que el usuario ya puso; cambia lo propio de la banda.
    tx = { ...tx, frequencyMHz: band.tx.frequencyMHz, lineLossDbPer100m: band.tx.lineLossDbPer100m, antennaGainDbd: band.tx.antennaGainDbd };
    rx = { ...rx, frequencyMHz: band.rx.frequencyMHz, lineLossDbPer100m: band.rx.lineLossDbPer100m, antennaGainDbd: band.rx.antennaGainDbd };
    txForm.setValues(tx);
    rxForm.setValues(rx);
    showBandRange();
    replaceQuery('banda', band.id);
    onParametersChange();
  });

  /** Vuelve a pintar el mapa visible con el último cálculo y el balance actual (sin recalcular). */
  function redraw() {
    if (!coverage || !geometry || !pixels) return;
    const down = talkOutBudget(tx, radio);
    const up = talkInBudget(rx, radio);
    const grids = { talkOut: coverage.grids[TALK_OUT]!, talkIn: coverage.grids[TALK_IN]! };
    renderCoverage(geometry, grids, view, down, up, thresholds, pixels);
    coverageLayer.draw(geometry, pixels);
    const isLevel = view !== 'balance';
    const sensitivity = view === 'talkIn' ? up.sensitivityDbm : down.sensitivityDbm;
    legend.update({
      views: VIEWS,
      activeView: view,
      title: VIEWS.find((v) => v.id === view)!.title,
      entries: isLevel
        ? levelBandLabels(sensitivity, thresholds).map((label, i) => ({ color: LEVEL_COLORS[i]!, label }))
        : BALANCE_LEGEND.map((e) => ({ color: e.color, label: e.label })),
      emptyLabel: isLevel ? 'no llega a la sensibilidad' : 'no llega ninguna',
      hatchLabel: 'baja confianza (ladera empinada junto al sitio)',
      thresholds: isLevel ? { values: thresholds, unit: 'dBm', min: -150, max: -20 } : undefined,
      opacity,
    });
  }

  function onParametersChange() {
    showBudget(talkOutBudget(tx, radio), talkInBudget(rx, radio));
    redraw();
    const location = site.getSite();
    controller.schedule(location && lmrCoverageRequest(location, site.getRadiusKm() * 1000, tx, rx, radio));
  }

  const readout = createHoverReadout(page.readoutRoot);
  page.map.on('mousemove', (event) => {
    const lines =
      coverage &&
      readoutLines(coverage, talkOutBudget(tx, radio), talkInBudget(rx, radio), {
        lon: event.lngLat.lng,
        lat: event.lngLat.lat,
      });
    if (lines) readout.show(lines, event.point.x, event.point.y);
    else readout.hide();
  });
  page.map.on('mouseout', () => readout.hide());

  onParametersChange();

  return () => {
    controller.destroy();
    page.destroy();
  };
}
