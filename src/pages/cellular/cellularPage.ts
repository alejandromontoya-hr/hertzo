// Celular (LTE / NR): un sitio con sectores. Mapas de RSRP, mejor sector y SINR.
// Todos los sectores comparten sitio, altura y frecuencia, así que el motor calcula una sola
// grilla de pérdidas y el patrón de cada antena se aplica al pintar: cambiar azimut,
// inclinación o número de sectores no obliga a recalcular.

import type { CoverageRequest, CoverageResult } from '../../coverage/computeCoverage';
import { bandLabels, paintBands, paintCategories } from '../../coverage/paint';
import { lowConfidencePixels, pixelAreaKm2 } from '../../coverage/pixelValues';
import { buildRasterGeometry, gridIndexAt, type RasterGeometry } from '../../coverage/raster';
import { LEVEL_COLORS } from '../../coverage/colorScale';
import { downloadCoverageKmz } from '../../export/coverageKmz';
import { exportFileName, type KmlPlacemark } from '../../export/kml';
import { destinationPoint, distanceM, initialBearingDeg } from '../../geo/geodesy';
import { createCoverageLayer } from '../../map/coverageLayer';
import { addExportControl } from '../../map/exportControl';
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
import { formatDb, formatDbi, formatHeight, formatLonLat, formatWatts } from '../../ui/format';
import { createHoverReadout } from '../../ui/hoverReadout';
import { replaceQuery, type PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindChoice, choiceHtml, coverageStatusHtml, createMapPage, siteSectionHtml } from '../shared/mapPage';
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

const SECTOR_COLORS = ['#1f5c8c', '#d95f0e', '#6b8e23', '#8c2d4a'];

type View = 'rsrp' | 'best' | 'sinr';
const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'rsrp', label: 'RSRP', title: 'Señal de referencia del mejor sector (dBm)' },
  { id: 'best', label: 'Mejor sector', title: 'Sector que atiende cada punto' },
  { id: 'sinr', label: 'SINR', title: 'Señal a interferencia más ruido, carga 100 % (dB)' },
];

const RSRP_DESCRIPTIONS = ['excelente', 'buena', 'regular', 'débil'];
const SINR_DESCRIPTIONS = ['excelente', 'buena', 'regular', 'límite'];

/** Valores de cada píxel de una cuadrícula: RSRP del mejor sector, cuál es y su SINR. */
interface SectorPixels {
  bestRsrp: Float32Array;
  bestSector: Int16Array;
  sinr: Float32Array;
  lowConfidence: Uint8Array;
}

const sectorPixelsFor = (size: number): SectorPixels => ({
  bestRsrp: new Float32Array(size),
  bestSector: new Int16Array(size),
  sinr: new Float32Array(size),
  lowConfidence: new Uint8Array(size),
});

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
  let values: SectorPixels | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Celular (LTE / 5G)</h2>
      <p class="hint">Un sitio con sectores. La pérdida de trayecto se calcula una vez; el patrón de cada antena se aplica al pintar.</p>
      ${choiceHtml('banda', BANDS.map((b) => ({ id: b.id, label: b.id === 'aws' ? 'AWS (2100 MHz)' : `${b.label} MHz` })), 'Banda')}
      <p class="hint" data-band-description></p>
      <div class="form" data-model></div>
      <p class="hint" data-model-hint></p>
    </section>
    ${siteSectionHtml('Sitio celular', 'la torre')}
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
  const exporter = addExportControl(page.map, [
    { label: 'KMZ para Google Earth', description: 'RSRP, mejor sector y SINR con sus leyendas, y la torre con sus sectores.', run: exportKmz },
  ]);
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
  const controller = createCoverageController(page.find('[data-coverage-status]'), page.find('[data-simulate-box]'), (result) => {
    coverage = result;
    geometry = buildRasterGeometry(result.plan);
    values = sectorPixelsFor(geometry.index.length);
    pixels = new Uint8ClampedArray(geometry.index.length * 4);
    exporter.setEnabled(true);
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

  /** RSRP por sector, mejor sector, SINR y baja confianza de cada píxel de la cuadrícula `geometry`. */
  function computePixels(result: CoverageResult, geometry: RasterGeometry, out: SectorPixels) {
    const { bestRsrp, bestSector, sinr } = out;
    const grid = result.grids[0]!;
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
    lowConfidencePixels(geometry, result.grids, lowConfidenceMask(result.request.engine), out.lowConfidence);
  }

  /** Pinta la vista `v` en `out`, igual sobre el mapa que para el KMZ. */
  function paintView(v: View, size: RasterGeometry, px: SectorPixels, out: Uint8ClampedArray) {
    if (v === 'best') {
      const shown = new Int16Array(px.bestSector.length);
      const minRsrp = Math.min(...thresholds.rsrp);
      for (let p = 0; p < shown.length; p++) shown[p] = px.bestRsrp[p]! >= minRsrp ? px.bestSector[p]! : -1;
      paintCategories(size, shown, SECTOR_COLORS, px.lowConfidence, out);
    } else {
      paintBands(size, v === 'rsrp' ? px.bestRsrp : px.sinr, thresholds[v], LEVEL_COLORS, px.lowConfidence, out);
    }
  }

  /** Título y textos de la leyenda de una vista, iguales en el mapa y en el KMZ. */
  function legendTexts(v: View) {
    const descriptions = v === 'rsrp' ? RSRP_DESCRIPTIONS : SINR_DESCRIPTIONS;
    return {
      title: VIEWS.find((x) => x.id === v)!.title,
      entries:
        v === 'best'
          ? azimuths.map((a, i) => ({ color: SECTOR_COLORS[i]!, label: `S${i + 1} (azimut ${a}°)` }))
          : bandLabels(thresholds[v], v === 'rsrp' ? 'dBm' : 'dB').map((label, i) => ({
              color: LEVEL_COLORS[i]!,
              label: `${label} · ${descriptions[i]}`,
            })),
      emptyLabel: v === 'sinr' ? 'por debajo del umbral más bajo' : `RSRP por debajo de ${Math.min(...thresholds.rsrp)} dBm`,
      hatchLabel: model === 'itm' ? 'baja confianza (ladera empinada junto a la torre)' : 'fuera del rango de validez del modelo',
    };
  }

  /** Descarga un KMZ con RSRP, mejor sector y SINR, cada uno con su leyenda, y la torre con sus sectores. */
  async function exportKmz() {
    if (!coverage) return;
    const result = coverage;
    let px: SectorPixels | null = null;
    const layerOf = (v: View, file: string) => ({
      name: VIEWS.find((x) => x.id === v)!.label,
      file,
      paint(g: RasterGeometry, out: Uint8ClampedArray<ArrayBuffer>) {
        // Las tres capas comparten cuadrícula: se calcula una vez, con la primera.
        if (!px) {
          px = sectorPixelsFor(g.index.length);
          computePixels(result, g, px);
        }
        paintView(v, g, px, out);
      },
      legend: legendTexts(v),
    });
    await downloadCoverageKmz({
      documentName: `Hertzo · Celular ${bandName()}${site.getName() ? ` · ${site.getName()}` : ''}`,
      fileName: exportFileName('celular', bandName(), result.plan.site, 'kmz', site.getName()),
      plan: result.plan,
      layers: [layerOf('rsrp', 'rsrp'), layerOf('best', 'mejor-sector'), layerOf('sinr', 'sinr')],
      opacity,
      site: towerPlacemark(result),
      lines: sectorLines(result),
    });
  }

  /** «700 MHz», «AWS» o «3500 MHz». */
  const bandName = () => (/^\d+$/.test(band.label) ? `${band.label} MHz` : band.label);

  function repaint() {
    if (!coverage || !geometry || !values || !pixels) return;
    paintView(view, geometry, values, pixels);
    coverageLayer.draw(geometry, pixels);

    const isBands = view !== 'best';
    legend.update({
      views: VIEWS,
      activeView: view,
      ...legendTexts(view),
      thresholds: isBands
        ? { values: thresholds[view as 'rsrp' | 'sinr'], unit: view === 'rsrp' ? 'dBm' : 'dB', min: view === 'rsrp' ? -150 : -20, max: view === 'rsrp' ? -20 : 50 }
        : undefined,
      opacity,
    });
    showSummary();
  }

  /** Resumen del último cálculo: filas (etiqueta, valor) y nota. La misma tabla va al KMZ. */
  function summaryTable(): { rows: string[][]; strongRow: number; note: string } | null {
    if (!coverage || !geometry || !values) return null;
    const { bestRsrp, sinr } = values;
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
    return {
      rows: [
        ['Potencia por elemento de recurso', `${oneDecimal.format(pRe)} dBm`],
        ['Ruido por elemento de recurso', `${oneDecimal.format(noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb))} dBm`],
        [`Área con RSRP ≥ ${minRsrp} dBm`, `${integerFormat.format(covered * area)} km² (${integerFormat.format((100 * covered) / inCircle)} %)`],
        ['Área con SINR ≥ 0 dB', `${integerFormat.format((100 * goodSinr) / inCircle)} %`],
      ],
      strongRow: 2,
      note: `Porcentajes sobre el círculo de cálculo. La SINR supone los ${azimuths.length} sectores transmitiendo a la vez.`,
    };
  }

  function showSummary() {
    const table = summaryTable();
    if (!table) return;
    summary.innerHTML = `
      <table class="budget">
        <tbody>
          ${table.rows
            .map(([label, value], i) => `<tr${i === table.strongRow ? ' class="strong"' : ''}><th scope="row">${label}</th><td>${value}</td></tr>`)
            .join('')}
        </tbody>
      </table>
      <p class="hint">${table.note}</p>`;
  }

  /** Ficha de la torre para el KMZ: banda, modelo, sitio, antena, azimuts y el resumen del panel. */
  function towerPlacemark(result: CoverageResult): KmlPlacemark {
    const position = result.plan.site;
    const summaryInfo = summaryTable();
    return {
      name: `${site.getName() || 'Torre'} · ${bandName()}`,
      position,
      tables: [
        {
          rows: [
            ['Ubicación (lat, lon)', formatLonLat(position.lon, position.lat)],
            ['Banda', band.description],
            ['Frecuencia de cálculo', `${band.frequencyMHz} MHz`],
            ['Portadora', carrier.label],
            ['Modelo de propagación', MODELS.find((m) => m.id === model)!.label],
            ['Radio de cálculo', `${integerFormat.format(result.plan.radiusM / 1000)} km`],
          ],
        },
        {
          title: 'Sitio y teléfono',
          rows: [
            ['Potencia por sector', `${formatWatts(siteParams.powerW)} (${oneDecimal.format(wattsToDbm(siteParams.powerW))} dBm)`],
            ['Pérdida de cable y conectores', formatDb(siteParams.cableLossDb)],
            ['Altura de las antenas', `${formatHeight(siteParams.antennaHeightM)} sobre el terreno`],
            ['Altura del teléfono', formatHeight(siteParams.ueHeightM)],
            ['Figura de ruido del teléfono', formatDb(siteParams.noiseFigureDb)],
          ],
        },
        {
          title: 'Antena de cada sector',
          rows: [
            ['Ganancia', formatDbi(antenna.gainDbi)],
            ['Ancho de haz horizontal', `${integerFormat.format(antenna.horizontalBeamwidthDeg)}°`],
            ['Ancho de haz vertical', `${integerFormat.format(antenna.verticalBeamwidthDeg)}°`],
            ['Inclinación hacia abajo', `${integerFormat.format(antenna.downtiltDeg)}°`],
          ],
        },
        { title: 'Sectores', header: ['', 'Azimut'], rows: azimuths.map((a, i) => [`S${i + 1}`, `${a}°`]) },
        ...(summaryInfo ? [{ title: 'Resumen', rows: summaryInfo.rows, note: summaryInfo.note }] : []),
      ],
    };
  }

  /** Línea de cada sector desde la torre hacia su azimut, de un tercio del radio de cálculo. */
  function sectorLines(result: CoverageResult) {
    const { site: position, radiusM } = result.plan;
    return {
      folderName: 'Sectores',
      lines: azimuths.map((a, i) => ({
        name: `S${i + 1} · ${a}°`,
        color: SECTOR_COLORS[i]!,
        points: [position, destinationPoint(position, a, radiusM / 3)],
      })),
    };
  }

  function redraw() {
    showModelHint();
    if (coverage && geometry && values) computePixels(coverage, geometry, values);
    repaint();
  }

  /** Cambios que afectan la pérdida de trayecto: sitio, radio, altura, frecuencia o modelo. */
  function onGeometryChange() {
    redraw();
    controller.setRequest(request());
  }

  bindChoice(page.panel, 'banda', band.id, (id) => {
    band = BANDS.find((b) => b.id === id)!;
    carrier = CARRIERS.find((c) => c.id === band.carrier)!;
    if (band.frequencyMHz > 2000 && model.startsWith('hata')) {
      model = 'uma';
      modelSelect.setValue(model);
    }
    showBand();
    replaceQuery('banda', band.id);
    onGeometryChange();
  });

  const readout = createHoverReadout(page.readoutRoot);
  page.map.on('mousemove', (event) => {
    if (!coverage || !values || !geometry) return readout.hide();
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
