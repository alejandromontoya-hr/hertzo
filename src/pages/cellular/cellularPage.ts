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
import { SHARE_NOTICE_HTML, showPageNotice, showSharedNotice } from '../../export/shareButton';
import { SHARE_BROKEN_MESSAGE } from '../../export/shareLink';
import { destinationPoint, distanceM, initialBearingDeg } from '../../geo/geodesy';
import { createCoverageLayer } from '../../map/coverageLayer';
import { addExportControl } from '../../map/exportControl';
import { addShareControl } from '../../map/shareControl';
import { lowConfidenceMask, type EngineSpec } from '../../propagation/engines';
import {
  CARRIERS,
  PHONE_LOCATIONS,
  angleDiffDeg,
  buildingEntryLossDb,
  locationMarginDb,
  lossCurve,
  neighborOffsetsM,
  noisePerResourceElementDbm,
  powerPerResourceElementDbm,
  sectorGainDbi,
  sinrDb,
  uplinkSinrDb,
  type HataEnvironment,
  type PhoneLocation,
  type SectorAntenna,
} from '../../rf/cellular';
import { itmSpec } from '../../coverage/inputs';
import { clutterQuery, clutterSummary, createClutterControl, parseClutter } from '../../ui/clutterControl';
import { createReliabilityControl, parseReliability } from '../../ui/reliabilityControl';
import { wattsToDbm } from '../../rf/units';
import { createMapLegend } from '../../ui/coverageLegend';
import { createFieldGroup, createSelectField } from '../../ui/fields';
import { formatDb, formatDbi, formatHeight, formatLonLat, formatWatts } from '../../ui/format';
import { createHoverReadout } from '../../ui/hoverReadout';
import { infoButton, setInfo } from '../../ui/infoTip';
import { replaceQuery, type PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindChoice, choiceHtml, coverageStatusHtml, createMapPage, siteSectionHtml } from '../shared/mapPage';
import { START_OVER_HTML, openDraft } from '../shared/draft';
import { createSiteControls } from '../shared/siteControls';
import {
  ANTENNA_FIELDS,
  BANDS,
  BASE_ANTENNA,
  BASE_SITE,
  CELL_THRESHOLDS,
  DEFAULT_AZIMUTHS,
  DEFAULT_NEIGHBOR_KM,
  DEFAULT_RADIUS_KM,
  MAX_RADIUS_KM,
  MAX_SECTORS,
  MODELS,
  NEIGHBOR_FIELD,
  SITE_FIELDS,
  defaultModel,
  type BandView,
  type ModelId,
  type SiteParams,
} from './cellularFields';
import { cellularShareData, readCellularShare } from './cellularShare';

const SECTOR_COLORS = ['#1f5c8c', '#d95f0e', '#6b8e23', '#8c2d4a'];

type View = 'rsrp' | 'best' | 'sinr' | 'up' | 'balance';
const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'rsrp', label: 'RSRP', title: 'Señal de referencia del mejor sector (dBm)' },
  { id: 'best', label: 'Sector', title: 'Sector que atiende cada punto' },
  { id: 'sinr', label: 'SINR', title: 'Señal a interferencia más ruido, carga 100 % con los vecinos (dB)' },
  { id: 'up', label: 'Subida', title: 'SINR de subida en la torre, por bloque de recursos (dB)' },
  { id: 'balance', label: 'Desbalance', title: 'Dónde llega cada dirección' },
];

/** Clases del desbalance: el teléfono ve la red (RSRP) y la torre lo oye (SINR de subida). */
const CELL_BALANCE = [
  { color: '#1f5c8c', label: 'Bajada y subida llegan' },
  { color: '#d95f0e', label: 'Solo bajada: el teléfono ve la red, pero la torre no lo oye' },
  { color: '#a8b65a', label: 'Solo subida: la torre oiría al teléfono, pero él no ve la red' },
];

const RSRP_DESCRIPTIONS = ['excelente', 'buena', 'regular', 'débil'];
const SINR_DESCRIPTIONS = ['excelente', 'buena', 'regular', 'límite'];

/** Valores de cada píxel de una cuadrícula: RSRP del mejor sector, cuál es y su SINR. */
interface SectorPixels {
  bestRsrp: Float32Array;
  bestSector: Int16Array;
  sinr: Float32Array;
  /** SINR de subida en el sector servidor (dB). */
  uplinkSinr: Float32Array;
  lowConfidence: Uint8Array;
}

const sectorPixelsFor = (size: number): SectorPixels => ({
  bestRsrp: new Float32Array(size),
  bestSector: new Int16Array(size),
  sinr: new Float32Array(size),
  uplinkSinr: new Float32Array(size),
  lowConfidence: new Uint8Array(size),
});

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
/** 1745 → "1.745"; 725,5 → "725,5". */
const mhzFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/** Desviación del desvanecimiento lognormal (dB): 8 dB para Hata y 6 dB para 38.901 UMa NLOS. */
/** σ del desvanecimiento lento según el motor que calculó el mapa: 6 dB en UMa, 8 dB en Hata. */
const shadowSigmaDb = (engineId: string) => (engineId === 'uma' ? 6 : 8);

export function mountCellularPage({ root, params: urlParams, shared }: PageContext): () => void {
  // Lo que dejaste en este navegador; con un enlace, lo tuyo queda aparte.
  const draft = openDraft('celular', urlParams, shared !== null);
  const params = draft.params;
  let band = BANDS.find((b) => b.id === params.get('banda')) ?? BANDS[0]!;
  // Enlace de "Compartir": la página abre con esos datos o, si no sirven, con los de siempre.
  const linked = shared?.ok ? readCellularShare(shared.data, band) : null;
  const opened = shared && (shared.ok && !linked ? { ok: false as const, message: SHARE_BROKEN_MESSAGE } : shared);
  // Con qué abre la página: el enlace o, si no hay, lo guardado en este navegador.
  const fromLink = linked ?? (draft.data ? readCellularShare(draft.data, band) : null);
  let carrier = CARRIERS.find((c) => c.id === (fromLink?.carrierId ?? band.carrier))!;
  let model: ModelId = fromLink?.model ?? defaultModel(band);
  let siteParams: SiteParams = fromLink?.siteParams ?? { ...BASE_SITE, ...band.site };
  let antenna: SectorAntenna = fromLink?.antenna ?? { ...BASE_ANTENNA, ...band.antenna };
  let phone: PhoneLocation = fromLink?.phone ?? 'exterior';
  let reliability = parseReliability(params, 50);
  let clutter = parseClutter(params);
  /** Distancia a los seis sitios vecinos (km); 0 = sin vecinos. */
  let neighborKm = fromLink?.neighborKm ?? DEFAULT_NEIGHBOR_KM;
  let azimuths = fromLink?.azimuths ?? [...DEFAULT_AZIMUTHS];
  let view: View = 'rsrp';
  let thresholds: Record<BandView, number[]> = {
    rsrp: fromLink?.thresholds ?? [...CELL_THRESHOLDS.rsrp.defaults],
    sinr: fromLink?.sinrThresholds ?? [...CELL_THRESHOLDS.sinr.defaults],
    up: fromLink?.upThresholds ?? [...CELL_THRESHOLDS.up.defaults],
  };
  let opacity = 0.7;

  let coverage: CoverageResult | null = null;
  let geometry: RasterGeometry | null = null;
  let values: SectorPixels | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Celular (LTE / 5G)${infoButton('Un sitio con sectores. La pérdida de trayecto se calcula una vez; el patrón de cada antena se aplica al pintar.')}</h2>
      ${choiceHtml('banda', BANDS.map((b) => ({ id: b.id, label: b.id === 'aws' ? 'AWS (2100 MHz)' : `${b.label} MHz` })), 'Banda', '')}
      <div class="form" data-model></div>
      <p class="notice" data-model-warning hidden></p>
      ${SHARE_NOTICE_HTML}
      ${START_OVER_HTML}
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
      <div data-summary><p class="hint">Ubica la torre y pulsa "Simular" para ver la cobertura.</p></div>
    </section>`,
    'Parámetros del sitio celular',
  );

  const bandDescription = page.find('[data-choice-info="banda"]');
  const modelWarning = page.find('[data-model-warning]');
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
      if (view === 'rsrp' || view === 'sinr' || view === 'up') thresholds = { ...thresholds, [view]: values };
      repaint();
    },
    onOpacity(value) {
      opacity = value;
      coverageLayer.setOpacity(value);
    },
  });

  const site = createSiteControls(page, {
    radiusKm: fromLink?.radiusKm ?? DEFAULT_RADIUS_KM,
    maxRadiusKm: MAX_RADIUS_KM,
    initial: fromLink ?? undefined,
    onChange: onGeometryChange,
  });
  const controller = createCoverageController(page.find('[data-coverage-status]'), page.find('[data-simulate-box]'), (result) => {
    coverage = result;
    geometry = buildRasterGeometry(result.plan);
    values = sectorPixelsFor(geometry.index.length);
    pixels = new Uint8ClampedArray(geometry.index.length * 4);
    exporter.setEnabled(true);
    redraw();
  });

  const modelSelect = createSelectField(`Modelo de propagación${infoButton('', 'data-model-info')}`, MODELS, model, (id) => {
    model = id as ModelId;
    onGeometryChange();
  });
  page.find('[data-model]').append(modelSelect.element);

  const siteFields = createFieldGroup(page.find('[data-site-params]'), SITE_FIELDS, siteParams, (next) => {
    siteParams = next;
    onGeometryChange();
  });
  page.find('[data-site-params]').append(
    createSelectField(
      `Dónde está el teléfono${infoButton('Dentro de un edificio la señal pierde lo que cuesta atravesar el muro exterior y avanzar adentro (3GPP 38.901, modelo O2I): unos 15 dB a 850 MHz y 17 dB a 3500 MHz con vidrio común, y 31 dB a 3500 MHz con vidrio reflectivo.')}`,
      PHONE_LOCATIONS,
      phone,
      (id) => {
        phone = id as PhoneLocation;
        redraw();
      },
    ).element,
  );
  createFieldGroup(
    page.find('[data-site-params]'),
    [NEIGHBOR_FIELD],
    { neighborKm },
    (next) => {
      neighborKm = next.neighborKm;
      redraw();
    },
  );
  const carrierSelect = createSelectField('Portadora', CARRIERS, carrier.id, (id) => {
    carrier = CARRIERS.find((c) => c.id === id)!;
    redraw();
  });
  page.find('[data-site-params]').append(carrierSelect.element);
  const antennaFields = createFieldGroup(page.find('[data-antenna]'), ANTENNA_FIELDS, antenna, (next) => {
    antenna = next;
    redraw();
  });
  createReliabilityControl(page.find('[data-model]'), reliability, (next) => {
    reliability = next;
    replaceQuery('confiabilidad', next === 50 ? null : String(next));
    onGeometryChange();
  });
  const clutterBox = document.createElement('div');
  clutterBox.className = 'form';
  page.find('[data-model]').append(clutterBox);
  createClutterControl(clutterBox, clutter, (next) => {
    clutter = next;
    const query = clutterQuery(clutter);
    replaceQuery('entorno', query.entorno);
    replaceQuery('altura-entorno', query.altura);
    onGeometryChange();
  });

  const sectorsBox = page.find('[data-sectors]');
  function buildSectorFields() {
    sectorsBox.replaceChildren();
    sectorsBox.append(
      createSelectField(
        'Número de sectores',
        Array.from({ length: MAX_SECTORS }, (_, i) => i + 1).map((n) => ({ id: String(n), label: `${n} sector${n > 1 ? 'es' : ''}` })),
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

  /** Lo que tienes en la página: lo mismo para el enlace y para lo guardado en el navegador. */
  const pageData = () =>
    cellularShareData(
      {
        site: site.getSite(),
        name: site.getName(),
        radiusKm: site.getRadiusKm(),
        thresholds: thresholds.rsrp,
        model,
        siteParams,
        antenna,
        phone,
        neighborKm,
        azimuths,
        carrierId: carrier.id,
        sinrThresholds: thresholds.sinr,
        upThresholds: thresholds.up,
      },
      band,
    );

  if (draft.hasOwn) showSharedNotice(page.panel, opened ?? { ok: true, data: null }, undefined, { label: 'Volver a la tuya', run: draft.backToOwn });
  else showSharedNotice(page.panel, opened);
  if (draft.restarted) showPageNotice(page.panel, 'Empezaste una simulación nueva.', { label: 'Deshacer', run: draft.undoStartOver });
  page.find('[data-start-over]').addEventListener('click', draft.startOver);
  addShareControl(page.map, {
    title: () => `Hertzo · Celular ${band.id === 'aws' ? 'AWS' : `${band.label} MHz`}${site.getName() ? ` · ${site.getName()}` : ''}`,
    data: pageData,
  });

  function showBand() {
    setInfo(bandDescription, `${band.description} Frecuencia de cálculo: ${band.frequencyMHz} MHz.`);
  }
  showBand();

  function engineSpec(): EngineSpec {
    if (model === 'uma') return { id: 'uma' };
    if (model === 'itm') return itmSpec(clutter, reliability);
    return { id: 'hata', environment: model.slice('hata-'.length) as HataEnvironment };
  }

  function request(): CoverageRequest | null {
    const location = site.getSite();
    if (!location) return null;
    return {
      site: location,
      radiusM: site.getRadiusKm() * 1000,
      engine: engineSpec(),
      // Bajada y subida por separado: cada una en su frecuencia (en TDD, la misma).
      links: [
        { siteHeightM: siteParams.antennaHeightM, radioHeightM: siteParams.ueHeightM, frequencyMHz: band.frequencyMHz },
        { siteHeightM: siteParams.antennaHeightM, radioHeightM: siteParams.ueHeightM, frequencyMHz: band.uplinkMHz },
      ],
    };
  }

  function showModelHint() {
    const f = band.frequencyMHz;
    const modelInfo = page.find('[data-model-info]');
    // Hata y UMa ya traen la ciudad; el entorno de la P.2108 solo aplica con ITM.
    clutterBox.hidden = model !== 'itm';
    // El aviso se ve siempre que el modelo no sirve para la banda; la explicación va en "i".
    modelWarning.hidden = !(model.startsWith('hata') && f > 2000);
    modelWarning.textContent = `Hata solo vale hasta 2000 MHz; a ${f} MHz todo el mapa queda rayado. Para esta banda usa 3GPP 38.901 o ITM.`;
    if (model.startsWith('hata')) {
      setInfo(
        modelInfo,
        'Hata se ajustó de 1 a 20 km con la antena de 30 a 200 m; entre 0,5 y 1 km se extrapola y fuera de eso aparece rayado. Altura efectiva: la mayor entre la de la torre y su altura sobre el terreno promedio de 3 a 15 km.',
      );
    } else if (model === 'uma') {
      setInfo(modelInfo, '3GPP 38.901 UMa vale hasta 5 km; más allá aparece rayado. Supone ciudad sin línea de vista.');
    } else {
      setInfo(modelInfo, 'ITM usa el relieve real: sirve en campo abierto y montaña, pero no ve edificios.');
    }
  }

  /** RSRP por sector, mejor sector, SINR y baja confianza de cada píxel de la cuadrícula `geometry`. */
  function computePixels(result: CoverageResult, geometry: RasterGeometry, out: SectorPixels) {
    const { bestRsrp, bestSector, sinr, uplinkSinr } = out;
    const grid = result.grids[0]!;
    // Sin la grilla de subida (no debería faltar) se usa la de bajada, del lado conservador.
    const upGrid = result.grids[1] ?? grid;
    const uplinkMHz = result.request.links[1]?.frequencyMHz ?? band.uplinkMHz;
    const up = uplinkParams();
    const upBase = -siteParams.cableLossDb - buildingEntryLossDb(uplinkMHz, phone);
    const pRe = powerPerResourceElementDbm(wattsToDbm(siteParams.powerW), carrier.resourceBlocks);
    const noise = noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb);
    // Señal mediana en el teléfono: pierde lo del edificio si está adentro (también la de los vecinos).
    const base = pRe - siteParams.cableLossDb - buildingEntryLossDb(result.request.links[0]!.frequencyMHz, phone);
    // Con Hata o UMa la confiabilidad es un margen z·σ sobre la mediana; con ITM ya viene en la pérdida.
    const margin = result.request.engine.id === 'itm' ? 0 : locationMarginDb(reliability, shadowSigmaDb(result.request.engine.id));
    const dh = siteParams.antennaHeightM - siteParams.ueHeightM;
    const levels = new Array<number>(azimuths.length);
    const neighbors = neighborKm > 0 ? neighborOffsetsM(neighborKm * 1000) : [];
    const curve = neighbors.length ? lossCurve(geometry.distanceM, Array.from(geometry.index, (g) => (g < 0 ? Number.NaN : grid.lossDb[g]!))) : null;
    curveCache = curve;
    const interferers: number[] = [];
    for (let p = 0; p < geometry.index.length; p++) {
      const g = geometry.index[p]!;
      if (g < 0 || Number.isNaN(grid.lossDb[g]!)) {
        bestRsrp[p] = Number.NaN;
        bestSector[p] = -1;
        sinr[p] = Number.NaN;
        uplinkSinr[p] = Number.NaN;
        continue;
      }
      const below = (Math.atan2(dh, Math.max(1, geometry.distanceM[p]!)) * 180) / Math.PI;
      let best = 0;
      for (let s = 0; s < azimuths.length; s++) {
        const off = angleDiffDeg(geometry.bearingDeg[p]!, azimuths[s]!);
        levels[s] = base + sectorGainDbi(antenna, off, below) - grid.lossDb[g]!;
        if (levels[s]! > levels[best]!) best = s;
      }
      bestRsrp[p] = levels[best]! - margin;
      bestSector[p] = best;
      // El teléfono se engancha al sector que mejor ve en bajada y transmite hacia esa antena.
      const upGain =
        upBase + sectorGainDbi(antenna, angleDiffDeg(geometry.bearingDeg[p]!, azimuths[best]!), below) - upGrid.lossDb[g]! - margin;
      uplinkSinr[p] = uplinkSinrDb(up, carrier.subcarrierKHz, upGain);
      interferers.length = 0;
      for (let s = 0; s < levels.length; s++) if (s !== best) interferers.push(levels[s]!);
      if (curve) neighborLevels(geometry.distanceM[p]!, geometry.bearingDeg[p]!, base, dh, neighbors, curve, interferers);
      sinr[p] = sinrDb(levels[best]!, interferers, noise);
    }
    lowConfidencePixels(geometry, result.grids, lowConfidenceMask(result.request.engine), out.lowConfidence);
  }

  /**
   * Agrega a `out` la señal (dBm) de cada sector de los sitios vecinos en un punto a `distanceM` y
   * `bearingDeg` del sitio: misma configuración y la pérdida típica por distancia del propio cálculo.
   */
  function neighborLevels(
    distanceM: number,
    bearingDeg: number,
    base: number,
    dh: number,
    neighbors: { x: number; y: number }[],
    curve: (d: number) => number,
    out: number[],
  ) {
    const b = (bearingDeg * Math.PI) / 180;
    const x = distanceM * Math.sin(b);
    const y = distanceM * Math.cos(b);
    for (const n of neighbors) {
      const dx = x - n.x;
      const dy = y - n.y;
      const d = Math.max(10, Math.hypot(dx, dy));
      const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
      const below = (Math.atan2(dh, d) * 180) / Math.PI;
      const loss = curve(d);
      for (const a of azimuths) out.push(base + sectorGainDbi(antenna, angleDiffDeg(bearing, a), below) - loss);
    }
  }

  function uplinkParams() {
    return {
      uePowerDbm: wattsToDbm(siteParams.uePowerW),
      resourceBlocks: Math.round(siteParams.uplinkResourceBlocks),
      siteNoiseFigureDb: siteParams.siteNoiseFigureDb,
      interferenceMarginDb: siteParams.uplinkInterferenceDb,
    };
  }

  /** Pinta la vista `v` en `out`, igual sobre el mapa que para el KMZ. */
  function paintView(v: View, size: RasterGeometry, px: SectorPixels, out: Uint8ClampedArray) {
    if (v === 'balance') {
      // Llega la bajada si el RSRP pasa el umbral más bajo; la subida, si su SINR pasa el suyo.
      const minRsrp = Math.min(...thresholds.rsrp);
      const minUp = Math.min(...thresholds.up);
      const classes = new Int16Array(px.bestRsrp.length);
      for (let p = 0; p < classes.length; p++) {
        const down = px.bestRsrp[p]! >= minRsrp;
        const upOk = px.uplinkSinr[p]! >= minUp;
        classes[p] = down && upOk ? 0 : down ? 1 : upOk ? 2 : -1;
      }
      paintCategories(size, classes, CELL_BALANCE.map((c) => c.color), px.lowConfidence, out);
    } else if (v === 'best') {
      const shown = new Int16Array(px.bestSector.length);
      const minRsrp = Math.min(...thresholds.rsrp);
      for (let p = 0; p < shown.length; p++) shown[p] = px.bestRsrp[p]! >= minRsrp ? px.bestSector[p]! : -1;
      paintCategories(size, shown, SECTOR_COLORS, px.lowConfidence, out);
    } else {
      paintBands(size, v === 'rsrp' ? px.bestRsrp : v === 'sinr' ? px.sinr : px.uplinkSinr, thresholds[v], LEVEL_COLORS, px.lowConfidence, out);
    }
  }

  /** Título y textos de la leyenda de una vista, iguales en el mapa y en el KMZ. */
  function legendTexts(v: View) {
    const descriptions = v === 'rsrp' ? RSRP_DESCRIPTIONS : SINR_DESCRIPTIONS;
    const title =
      v === 'balance'
        ? `Dónde llega cada dirección: RSRP ≥ ${Math.min(...thresholds.rsrp)} dBm y SINR de subida ≥ ${Math.min(...thresholds.up)} dB (los umbrales más bajos de cada mapa)`
        : VIEWS.find((x) => x.id === v)!.title;
    return {
      title: (v === 'rsrp' || v === 'up' || v === 'balance') && reliability !== 50 ? `${title} · ${reliability} % de confiabilidad` : title,
      entries:
        v === 'best'
          ? azimuths.map((a, i) => ({ color: SECTOR_COLORS[i]!, label: `S${i + 1} (azimut ${a}°)` }))
          : v === 'balance'
            ? CELL_BALANCE.map((c) => ({ color: c.color, label: c.label }))
            : bandLabels(thresholds[v], v === 'rsrp' ? 'dBm' : 'dB').map((label, i) => ({
                color: LEVEL_COLORS[i]!,
                label: `${label} · ${descriptions[i]}`,
              })),
      emptyLabel:
        v === 'sinr' || v === 'up'
          ? 'por debajo del umbral más bajo'
          : v === 'balance'
            ? 'no llega ninguna'
            : `RSRP por debajo de ${Math.min(...thresholds.rsrp)} dBm`,
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
      layers: [
        layerOf('rsrp', 'rsrp'),
        layerOf('best', 'mejor-sector'),
        layerOf('sinr', 'sinr'),
        layerOf('up', 'subida'),
        layerOf('balance', 'desbalance'),
      ],
      opacity,
      site: towerPlacemark(result),
      lines: sectorLines(result),
    });
  }

  /** "700 MHz", "AWS" o "3500 MHz". */
  const bandName = () => (/^\d+$/.test(band.label) ? `${band.label} MHz` : band.label);

  function repaint() {
    if (!coverage || !geometry || !values || !pixels) return;
    paintView(view, geometry, values, pixels);
    coverageLayer.draw(geometry, pixels);

    const isBands = view === 'rsrp' || view === 'sinr' || view === 'up';
    legend.update({
      views: VIEWS,
      activeView: view,
      ...legendTexts(view),
      thresholds: isBands
        ? { values: thresholds[view as BandView], unit: view === 'rsrp' ? 'dBm' : 'dB', min: CELL_THRESHOLDS[view as BandView].min, max: CELL_THRESHOLDS[view as BandView].max }
        : undefined,
      opacity,
    });
    showSummary();
  }

  /** Resumen del último cálculo: filas (etiqueta, valor) y nota. La misma tabla va al KMZ. */
  function summaryTable(): { rows: string[][]; strongRow: number; note: string } | null {
    if (!coverage || !geometry || !values) return null;
    const { bestRsrp, sinr, uplinkSinr } = values;
    const pRe = powerPerResourceElementDbm(wattsToDbm(siteParams.powerW), carrier.resourceBlocks);
    const area = pixelAreaKm2(geometry, coverage.plan.radiusM);
    const minRsrp = Math.min(...thresholds.rsrp);
    const minUp = Math.min(...thresholds.up);
    let inCircle = 0;
    let covered = 0;
    let goodSinr = 0;
    let upCovered = 0;
    let both = 0;
    for (let p = 0; p < bestRsrp.length; p++) {
      if (geometry.index[p]! < 0) continue;
      inCircle++;
      if (bestRsrp[p]! >= minRsrp) covered++;
      if (sinr[p]! >= 0) goodSinr++;
      if (uplinkSinr[p]! >= minUp) upCovered++;
      if (bestRsrp[p]! >= minRsrp && uplinkSinr[p]! >= minUp) both++;
    }
    const up = uplinkParams();
    const uplinkMHz = coverage.request.links[1]?.frequencyMHz ?? band.uplinkMHz;
    return {
      rows: [
        ['Potencia por elemento de recurso', `${oneDecimal.format(pRe)} dBm`],
        ['Ruido por elemento de recurso', `${oneDecimal.format(noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb))} dBm`],
        [`Área con RSRP ≥ ${minRsrp} dBm`, `${integerFormat.format(covered * area)} km² (${integerFormat.format((100 * covered) / inCircle)} %)`],
        ['Área con SINR ≥ 0 dB', `${integerFormat.format((100 * goodSinr) / inCircle)} %`],
        [`Área con subida (SINR ≥ ${minUp} dB)`, `${integerFormat.format(upCovered * area)} km² (${integerFormat.format((100 * upCovered) / inCircle)} %)`],
        ['Área con bajada y subida', `${integerFormat.format(both * area)} km² (${integerFormat.format((100 * both) / inCircle)} %)`],
        [
          'Teléfono por bloque de subida',
          `${oneDecimal.format(up.uePowerDbm - 10 * Math.log10(up.resourceBlocks))} dBm (${oneDecimal.format(up.uePowerDbm)} dBm en ${up.resourceBlocks} bloque${up.resourceBlocks === 1 ? '' : 's'})`,
        ],
      ],
      strongRow: 5,
      note: `Porcentajes sobre el círculo de cálculo. La SINR de bajada supone los ${azimuths.length} sectores transmitiendo a la vez; la de subida suma ${oneDecimal.format(up.interferenceMarginDb)} dB de margen por interferencia y usa la pérdida calculada a ${mhzFormat.format(uplinkMHz)} MHz.`,
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
            ['Frecuencia de cálculo', `bajada ${mhzFormat.format(band.frequencyMHz)} MHz, subida ${mhzFormat.format(band.uplinkMHz)} MHz`],
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
            ['Potencia del teléfono', `${formatWatts(siteParams.uePowerW)} (${oneDecimal.format(wattsToDbm(siteParams.uePowerW))} dBm)`],
            ['Bloques de subida en el borde', integerFormat.format(siteParams.uplinkResourceBlocks)],
            ['Figura de ruido de la torre', formatDb(siteParams.siteNoiseFigureDb)],
            ['Margen por interferencia de subida', formatDb(siteParams.uplinkInterferenceDb)],
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
    carrierSelect.setValue(carrier.id);
    // Cada banda trae sus valores típicos de potencia, cable y antena.
    siteParams = { ...siteParams, powerW: band.site?.powerW ?? BASE_SITE.powerW, cableLossDb: band.site?.cableLossDb ?? BASE_SITE.cableLossDb };
    antenna = { ...antenna, gainDbi: band.antenna?.gainDbi ?? BASE_ANTENNA.gainDbi, verticalBeamwidthDeg: band.antenna?.verticalBeamwidthDeg ?? BASE_ANTENNA.verticalBeamwidthDeg };
    siteFields.setValues(siteParams);
    antennaFields.setValues(antenna);
    if (band.frequencyMHz > 2000 && model.startsWith('hata')) {
      model = 'uma';
      modelSelect.setValue(model);
    }
    showBand();
    replaceQuery('banda', band.id);
    onGeometryChange();
  });

  /** Interferencia en un punto de la lectura: los demás sectores y los vecinos, como en el mapa. */
  function readoutInterferers(median: number[], best: number, d: number, bearing: number, base: number): number[] {
    const out = median.filter((_, s) => s !== best);
    if (neighborKm > 0 && coverage && geometry) {
      const grid = coverage.grids[0]!;
      curveCache ??= lossCurve(geometry.distanceM, Array.from(geometry.index, (g) => (g < 0 ? Number.NaN : grid.lossDb[g]!)));
      neighborLevels(d, bearing, base, siteParams.antennaHeightM - siteParams.ueHeightM, neighborOffsetsM(neighborKm * 1000), curveCache, out);
    }
    return out;
  }
  let curveCache: ((d: number) => number) | null = null;

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
    const base = pRe - siteParams.cableLossDb - buildingEntryLossDb(coverage.request.links[0]!.frequencyMHz, phone);
    const margin = coverage.request.engine.id === 'itm' ? 0 : locationMarginDb(reliability, shadowSigmaDb(coverage.request.engine.id));
    const median = azimuths.map((a) => base + sectorGainDbi(antenna, angleDiffDeg(bearing, a), below) - grid.lossDb[g]!);
    const levels = median.map((l) => l - margin);
    const best = levels.indexOf(Math.max(...levels));
    const noise = noisePerResourceElementDbm(carrier.subcarrierKHz, siteParams.noiseFigureDb);
    const upGrid = coverage.grids[1] ?? grid;
    const uplinkMHz = coverage.request.links[1]?.frequencyMHz ?? band.uplinkMHz;
    const upGain =
      -siteParams.cableLossDb -
      buildingEntryLossDb(uplinkMHz, phone) +
      sectorGainDbi(antenna, angleDiffDeg(bearing, azimuths[best]!), below) -
      upGrid.lossDb[g]! -
      margin;
    const lines = [
      `A ${oneDecimal.format(d / 1000)} km de la torre, rumbo ${integerFormat.format(bearing)}°`,
      `Mejor sector: S${best + 1} · RSRP ${oneDecimal.format(levels[best]!)} dBm`,
      `SINR ${oneDecimal.format(sinrDb(median[best]!, readoutInterferers(median, best, d, bearing, base), noise))} dB`,
      `Subida: SINR ${oneDecimal.format(uplinkSinrDb(uplinkParams(), carrier.subcarrierKHz, upGain))} dB por bloque en S${best + 1}`,
      ...levels.map((l, s) => `S${s + 1}: ${oneDecimal.format(l)} dBm`),
    ];
    if (grid.warnings[g]! & lowConfidenceMask(coverage.request.engine)) {
      lines.push(model === 'itm' ? 'Baja confianza: ladera empinada junto a la torre' : 'Fuera del rango de validez del modelo');
    }
    const entorno = clutterSummary(coverage.request);
    if (entorno) lines.push(entorno);
    readout.show(lines, event.point.x, event.point.y);
  });
  page.map.on('mouseout', () => readout.hide());

  onGeometryChange();

  draft.start(root, pageData);

  return () => {
    draft.stop();
    controller.destroy();
    page.destroy();
  };
}
