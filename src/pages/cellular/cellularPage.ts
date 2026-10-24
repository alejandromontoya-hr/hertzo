// Celular (LTE / NR): un sitio con sectores. Mapas de RSRP, mejor sector y SINR.
// Todos los sectores comparten sitio, altura y frecuencia, así que el motor calcula una sola
// grilla de pérdidas y el patrón de cada antena se aplica al pintar: cambiar azimut,
// inclinación o número de sectores no obliga a recalcular.

import type { CoverageRequest, CoverageResult } from '../../coverage/computeCoverage';
import { bandLabels, paintBands, paintCategories } from '../../coverage/paint';
import { lowConfidencePixels, pixelAreaKm2 } from '../../coverage/pixelValues';
import { buildRasterGeometry, gridIndexAt, type RasterGeometry } from '../../coverage/raster';
import { LEVEL_COLORS } from '../../coverage/colorScale';
import { distanceM, initialBearingDeg } from '../../geo/geodesy';
import { createCoverageLayer } from '../../map/coverageLayer';
import { lowConfidenceMask, type EngineSpec } from '../../propagation/engines';
import {
  CARRIERS,
  HATA_ENVIRONMENTS,
  angleDiffDeg,
  noisePerResourceElementDbm,
  powerPerResourceElementDbm,
  sectorGainDbi,
  sinrDb,
  type HataEnvironment,
  type SectorAntenna,
} from '../../rf/cellular';
import { wattsToDbm } from '../../rf/units';
import { createMapLegend } from '../../ui/coverageLegend';
import { createFieldGroup, createSelectField, type NumberFieldSpec } from '../../ui/fields';
import { createHoverReadout } from '../../ui/hoverReadout';
import type { PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindSegmented, coverageStatusHtml, createMapPage, segmentedHtml, siteSectionHtml } from '../shared/mapPage';
import { createSiteControls } from '../shared/siteControls';

interface Band {
  id: string;
  label: string;
  /** Frecuencia central de bajada (MHz). */
  frequencyMHz: number;
  carrier: string;
  description: string;
}

const BANDS: readonly Band[] = [
  { id: '700', label: '700', frequencyMHz: 780, carrier: 'lte10', description: 'Banda 28 (APT 700): bajada 758–803 MHz.' },
  { id: '850', label: '850', frequencyMHz: 880, carrier: 'lte10', description: 'Banda 5: bajada 869–894 MHz.' },
  { id: '1900', label: '1900', frequencyMHz: 1960, carrier: 'lte15', description: 'Banda 2 (PCS): bajada 1930–1990 MHz.' },
  { id: 'aws', label: 'AWS', frequencyMHz: 2130, carrier: 'lte20', description: 'Bandas 4 y 66 (AWS): bajada 2110–2200 MHz.' },
  { id: '2600', label: '2600', frequencyMHz: 2650, carrier: 'lte20', description: 'Banda 7: bajada 2620–2690 MHz.' },
  { id: '3500', label: '3500', frequencyMHz: 3500, carrier: 'nr100', description: 'Banda n78 (5G NR): 3300–3800 MHz.' },
];

type ModelId = `hata-${HataEnvironment}` | 'uma' | 'itm';

const MODELS: readonly { id: ModelId; label: string }[] = [
  ...HATA_ENVIRONMENTS.map((e) => ({ id: `hata-${e.id}` as ModelId, label: `Hata / COST-231 · ${e.label}` })),
  { id: 'uma', label: '3GPP 38.901 · macrocelda urbana (sin línea de vista)' },
  { id: 'itm', label: 'ITM con terreno (rural y montaña)' },
];

interface SiteParams {
  antennaHeightM: number;
  powerW: number;
  cableLossDb: number;
  ueHeightM: number;
  noiseFigureDb: number;
}

const SITE_FIELDS: readonly NumberFieldSpec<keyof SiteParams>[] = [
  { key: 'antennaHeightM', label: 'Altura de las antenas', unit: 'm', min: 1, max: 300 },
  { key: 'powerW', label: 'Potencia por sector', unit: 'W', min: 0, max: 400, minExclusive: true },
  { key: 'cableLossDb', label: 'Pérdida de cable y conectores', unit: 'dB', min: 0, max: 20 },
  { key: 'ueHeightM', label: 'Altura del teléfono', unit: 'm', min: 0.5, max: 30 },
  { key: 'noiseFigureDb', label: 'Figura de ruido del teléfono', unit: 'dB', min: 0, max: 15 },
];

const ANTENNA_FIELDS: readonly NumberFieldSpec<keyof SectorAntenna>[] = [
  { key: 'gainDbi', label: 'Ganancia', unit: 'dBi', min: -5, max: 30 },
  { key: 'horizontalBeamwidthDeg', label: 'Ancho de haz horizontal', unit: '°', min: 10, max: 360 },
  { key: 'verticalBeamwidthDeg', label: 'Ancho de haz vertical', unit: '°', min: 2, max: 90 },
  { key: 'downtiltDeg', label: 'Inclinación hacia abajo', unit: '°', min: -10, max: 30 },
];

const SECTOR_COLORS = ['#0969da', '#bc4c00', '#8250df', '#1a7f37'];

type View = 'rsrp' | 'best' | 'sinr';
const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'rsrp', label: 'RSRP', title: 'Señal de referencia del mejor sector (dBm)' },
  { id: 'best', label: 'Mejor sector', title: 'Sector que atiende cada punto' },
  { id: 'sinr', label: 'SINR', title: 'Señal a interferencia más ruido, carga 100 % (dB)' },
];

const RSRP_DESCRIPTIONS = ['excelente', 'buena', 'regular', 'débil'];
const SINR_DESCRIPTIONS = ['excelente', 'buena', 'regular', 'límite'];

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export function mountCellularPage({ root, params }: PageContext): () => void {
  let band = BANDS.find((b) => b.id === params.get('banda')) ?? BANDS[0]!;
  let carrier = CARRIERS.find((c) => c.id === band.carrier)!;
  let model: ModelId = band.frequencyMHz > 2000 ? 'uma' : 'hata-urbano';
  let siteParams: SiteParams = { antennaHeightM: 30, powerW: 40, cableLossDb: 2, ueHeightM: 1.5, noiseFigureDb: 7 };
  let antenna: SectorAntenna = { gainDbi: 17, horizontalBeamwidthDeg: 65, verticalBeamwidthDeg: 7, downtiltDeg: 4 };
  let azimuths = [0, 120, 240];
  let view: View = 'rsrp';
  let thresholds: Record<'rsrp' | 'sinr', number[]> = { rsrp: [-80, -90, -100, -110], sinr: [20, 13, 5, 0] };
  let opacity = 0.7;

  let coverage: CoverageResult | null = null;
  let geometry: RasterGeometry | null = null;
  let bestRsrp: Float32Array | null = null;
  let bestSector: Int16Array | null = null;
  let sinr: Float32Array | null = null;
  let lowConfidence: Uint8Array | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Celular (LTE / 5G)</h2>
      <p class="hint">Un sitio con sectores. La pérdida de trayecto se calcula una vez; el patrón de cada antena se aplica al pintar.</p>
      ${segmentedHtml('banda', BANDS.map((b) => ({ id: b.id, label: b.label })), 'Banda')}
      <p class="hint" data-band-description></p>
      <div class="form" data-model></div>
      <p class="hint" data-model-hint></p>
    </section>
    ${siteSectionHtml('Sitio celular', 'Haz clic en el mapa para ubicar la torre.')}
    ${coverageStatusHtml()}
    <details class="panel-section" open>
      <summary>Sectores</summary>
      <div class="form" data-sectors></div>
    </details>
    <details class="panel-section">
      <summary>Sitio y teléfono</summary>
      <div class="form" data-site-params></div>
    </details>
    <details class="panel-section">
      <summary>Antena de cada sector</summary>
      <div class="form" data-antenna></div>
    </details>
    <section class="panel-section">
      <h2>Resumen</h2>
      <div data-summary><p class="hint">Ubica la torre para ver la cobertura.</p></div>
    </section>`,
    'Parámetros del sitio celular',
  );

  const bandDescription = page.find('[data-band-description]');
  const modelHint = page.find('[data-model-hint]');
  const summary = page.find('[data-summary]');
  const coverageLayer = createCoverageLayer(page.map, opacity);
  const legend = createMapLegend(page.legendRoot, {
    onView(id) {
      view = id as View;
      repaint();
    },
    onThresholds(values) {
      if (view !== 'best') thresholds = { ...thresholds, [view]: values };
      repaint();
    },
    onOpacity(value) {
      opacity = value;
      coverageLayer.setOpacity(value);
    },
  });

  const site = createSiteControls(page, { radiusKm: 5, maxRadiusKm: 40, onChange: onGeometryChange });
  const controller = createCoverageController(page.find('[data-coverage-status]'), (result) => {
    coverage = result;
    geometry = buildRasterGeometry(result.plan);
    const n = geometry.index.length;
    bestRsrp = new Float32Array(n);
    bestSector = new Int16Array(n);
    sinr = new Float32Array(n);
    lowConfidence = new Uint8Array(n);
    pixels = new Uint8ClampedArray(n * 4);
    redraw();
  });

  const modelSelect = createSelectField('Modelo de propagación', MODELS, model, (id) => {
    model = id as ModelId;
    onGeometryChange();
  });
  page.find('[data-model]').append(modelSelect.element);

  createFieldGroup(page.find('[data-site-params]'), SITE_FIELDS, siteParams, (next) => {
    siteParams = next;
    onGeometryChange();
  });
  page.find('[data-site-params]').append(
    createSelectField('Portadora', CARRIERS, carrier.id, (id) => {
      carrier = CARRIERS.find((c) => c.id === id)!;
      redraw();
    }).element,
  );
  createFieldGroup(page.find('[data-antenna]'), ANTENNA_FIELDS, antenna, (next) => {
    antenna = next;
    redraw();
  });

  const sectorsBox = page.find('[data-sectors]');
  function buildSectorFields() {
    sectorsBox.replaceChildren();
    sectorsBox.append(
      createSelectField(
        'Número de sectores',
        [1, 2, 3, 4].map((n) => ({ id: String(n), label: `${n} sector${n > 1 ? 'es' : ''}` })),
        String(azimuths.length),
        (id) => {
          const count = Number(id);
          const spacing = 360 / count;
          azimuths = Array.from({ length: count }, (_, i) => azimuths[i] ?? Math.round(i * spacing));
          buildSectorFields();
          redraw();
        },
      ).element,
    );
    const values = Object.fromEntries(azimuths.map((a, i) => [`s${i}`, a])) as Record<string, number>;
    const specs = azimuths.map((_, i) => ({
      key: `s${i}`,
      label: `<span class="legend-swatch" style="background:${SECTOR_COLORS[i]}"></span>Azimut del sector S${i + 1}`,
      unit: '°',
      min: 0,
      max: 360,
    }));
    createFieldGroup(sectorsBox, specs, values, (next) => {
      azimuths = azimuths.map((_, i) => next[`s${i}`]!);
      redraw();
    });
  }
  buildSectorFields();

  function showBand() {
    bandDescription.textContent = `${band.description} Frecuencia de cálculo: ${band.frequencyMHz} MHz.`;
  }
  showBand();

  function engineSpec(): EngineSpec {
    if (model === 'uma') return { id: 'uma' };
    if (model === 'itm') return { id: 'itm' };
    return { id: 'hata', environment: model.slice('hata-'.length) as HataEnvironment };
  }

  function request(): CoverageRequest | null {
    const location = site.getSite();
    if (!location) return null;
    return {
      site: location,
      radiusM: site.getRadiusKm() * 1000,
      engine: engineSpec(),
      links: [{ siteHeightM: siteParams.antennaHeightM, radioHeightM: siteParams.ueHeightM, frequencyMHz: band.frequencyMHz }],
    };
  }

  function showModelHint() {
    const f = band.frequencyMHz;
    if (model.startsWith('hata') && f > 2000) {
      modelHint.textContent = `Hata solo vale hasta 2000 MHz; a ${f} MHz todo el mapa queda rayado. Para esta banda usa 3GPP 38.901 o ITM.`;
    } else if (model.startsWith('hata')) {
      modelHint.textContent =
        'Hata se ajustó de 1 a 20 km con la antena de 30 a 200 m; entre 0,5 y 1 km se extrapola y fuera de eso aparece rayado. Altura efectiva: la mayor entre la de la torre y su altura sobre el terreno promedio de 3 a 15 km.';
    } else if (model === 'uma') {
      modelHint.textContent = '3GPP 38.901 UMa vale hasta 5 km; más allá aparece rayado. Supone ciudad sin línea de vista.';
    } else {
      modelHint.textContent = 'ITM usa el relieve real: sirve en campo abierto y montaña, pero no ve edificios.';
    }
  }

  /** RSRP por sector, mejor sector y SINR de cada píxel. */
  function computePixels() {
    if (!coverage || !geometry || !bestRsrp || !bestSector || !sinr) return;
    const grid = coverage.grids[0]!;
    const pRe = powerPerResourceElementDbm(wattsToDbm(siteParams.powerW), carrier.resourceBlocks);
    const noise = noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb);
    const base = pRe - siteParams.cableLossDb;
    const dh = siteParams.antennaHeightM - siteParams.ueHeightM;
    const levels = new Array<number>(azimuths.length);
    for (let p = 0; p < geometry.index.length; p++) {
      const g = geometry.index[p]!;
      if (g < 0 || Number.isNaN(grid.lossDb[g]!)) {
        bestRsrp[p] = Number.NaN;
        bestSector[p] = -1;
        sinr[p] = Number.NaN;
        continue;
      }
      const below = (Math.atan2(dh, Math.max(1, geometry.distanceM[p]!)) * 180) / Math.PI;
      let best = 0;
      for (let s = 0; s < azimuths.length; s++) {
        const off = angleDiffDeg(geometry.bearingDeg[p]!, azimuths[s]!);
        levels[s] = base + sectorGainDbi(antenna, off, below) - grid.lossDb[g]!;
        if (levels[s]! > levels[best]!) best = s;
      }
      bestRsrp[p] = levels[best]!;
      bestSector[p] = best;
      sinr[p] = sinrDb(levels[best]!, levels.filter((_, s) => s !== best), noise);
    }
  }

  function repaint() {
    if (!coverage || !geometry || !bestRsrp || !bestSector || !sinr || !lowConfidence || !pixels) return;
    if (view === 'best') {
      const shown = new Int16Array(bestSector.length);
      const minRsrp = Math.min(...thresholds.rsrp);
      for (let p = 0; p < shown.length; p++) shown[p] = bestRsrp[p]! >= minRsrp ? bestSector[p]! : -1;
      paintCategories(geometry, shown, SECTOR_COLORS, lowConfidence, pixels);
    } else {
      paintBands(geometry, view === 'rsrp' ? bestRsrp : sinr, thresholds[view], LEVEL_COLORS, lowConfidence, pixels);
    }
    coverageLayer.draw(geometry, pixels);

    const isBands = view !== 'best';
    const descriptions = view === 'rsrp' ? RSRP_DESCRIPTIONS : SINR_DESCRIPTIONS;
    legend.update({
      views: VIEWS,
      activeView: view,
      title: VIEWS.find((v) => v.id === view)!.title,
      entries: isBands
        ? bandLabels(thresholds[view as 'rsrp' | 'sinr'], view === 'rsrp' ? 'dBm' : 'dB').map((label, i) => ({
            color: LEVEL_COLORS[i]!,
            label: `${label} · ${descriptions[i]}`,
          }))
        : azimuths.map((a, i) => ({ color: SECTOR_COLORS[i]!, label: `S${i + 1} (azimut ${a}°)` })),
      emptyLabel: view === 'sinr' ? 'por debajo del umbral más bajo' : `RSRP por debajo de ${Math.min(...thresholds.rsrp)} dBm`,
      hatchLabel: model === 'itm' ? 'baja confianza (ladera empinada junto a la torre)' : 'fuera del rango de validez del modelo',
      thresholds: isBands
        ? { values: thresholds[view as 'rsrp' | 'sinr'], unit: view === 'rsrp' ? 'dBm' : 'dB', min: view === 'rsrp' ? -150 : -20, max: view === 'rsrp' ? -20 : 50 }
        : undefined,
      opacity,
    });
    showSummary();
  }

  function showSummary() {
    if (!coverage || !geometry || !bestRsrp || !sinr) return;
    const pRe = powerPerResourceElementDbm(wattsToDbm(siteParams.powerW), carrier.resourceBlocks);
    const area = pixelAreaKm2(geometry, coverage.plan.radiusM);
    const minRsrp = Math.min(...thresholds.rsrp);
    let inCircle = 0;
    let covered = 0;
    let goodSinr = 0;
    for (let p = 0; p < bestRsrp.length; p++) {
      if (geometry.index[p]! < 0) continue;
      inCircle++;
      if (bestRsrp[p]! >= minRsrp) covered++;
      if (sinr[p]! >= 0) goodSinr++;
    }
    summary.innerHTML = `
      <table class="budget">
        <tbody>
          <tr><th scope="row">Potencia por elemento de recurso</th><td>${oneDecimal.format(pRe)} dBm</td></tr>
          <tr><th scope="row">Ruido por elemento de recurso</th><td>${oneDecimal.format(noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb))} dBm</td></tr>
          <tr class="strong"><th scope="row">Área con RSRP ≥ ${minRsrp} dBm</th><td>${integerFormat.format(covered * area)} km² (${integerFormat.format((100 * covered) / inCircle)} %)</td></tr>
          <tr><th scope="row">Área con SINR ≥ 0 dB</th><td>${integerFormat.format((100 * goodSinr) / inCircle)} %</td></tr>
        </tbody>
      </table>
      <p class="hint">Porcentajes sobre el círculo de cálculo. La SINR supone los ${azimuths.length} sectores transmitiendo a la vez.</p>`;
  }

  function redraw() {
    showModelHint();
    computePixels();
    if (coverage && geometry && lowConfidence) {
      lowConfidencePixels(geometry, coverage.grids, lowConfidenceMask(coverage.request.engine), lowConfidence);
    }
    repaint();
  }

  /** Cambios que afectan la pérdida de trayecto: sitio, radio, altura, frecuencia o modelo. */
  function onGeometryChange() {
    redraw();
    controller.schedule(request());
  }

  bindSegmented(page.panel, 'banda', band.id, (id) => {
    band = BANDS.find((b) => b.id === id)!;
    carrier = CARRIERS.find((c) => c.id === band.carrier)!;
    if (band.frequencyMHz > 2000 && model.startsWith('hata')) {
      model = 'uma';
      modelSelect.setValue(model);
    }
    showBand();
    history.replaceState(null, '', `#/celular?banda=${band.id}`);
    onGeometryChange();
  });

  const readout = createHoverReadout(page.readoutRoot);
  page.map.on('mousemove', (event) => {
    if (!coverage || !bestRsrp || !bestSector || !sinr || !geometry) return readout.hide();
    const point = { lon: event.lngLat.lng, lat: event.lngLat.lat };
    const g = gridIndexAt(coverage.plan, point);
    if (g < 0) return readout.hide();
    const d = distanceM(coverage.plan.site, point);
    const bearing = initialBearingDeg(coverage.plan.site, point);
    const grid = coverage.grids[0]!;
    const pRe = powerPerResourceElementDbm(wattsToDbm(siteParams.powerW), carrier.resourceBlocks);
    const below = (Math.atan2(siteParams.antennaHeightM - siteParams.ueHeightM, Math.max(1, d)) * 180) / Math.PI;
    const levels = azimuths.map(
      (a) => pRe - siteParams.cableLossDb + sectorGainDbi(antenna, angleDiffDeg(bearing, a), below) - grid.lossDb[g]!,
    );
    const best = levels.indexOf(Math.max(...levels));
    const noise = noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb);
    const lines = [
      `A ${oneDecimal.format(d / 1000)} km de la torre, rumbo ${integerFormat.format(bearing)}°`,
      `Mejor sector: S${best + 1} · RSRP ${oneDecimal.format(levels[best]!)} dBm`,
      `SINR ${oneDecimal.format(sinrDb(levels[best]!, levels.filter((_, s) => s !== best), noise))} dB`,
      ...levels.map((l, s) => `S${s + 1}: ${oneDecimal.format(l)} dBm`),
    ];
    if (grid.warnings[g]! & lowConfidenceMask(coverage.request.engine)) {
      lines.push(model === 'itm' ? 'Baja confianza: ladera empinada junto a la torre' : 'Fuera del rango de validez del modelo');
    }
    readout.show(lines, event.point.x, event.point.y);
  });
  page.map.on('mouseout', () => readout.hide());

  onGeometryChange();

  return () => {
    controller.destroy();
    page.destroy();
  };
}
