// Radiocomunicaciones en terreno abierto (LMR): trunking P25, convencional, SmartZone.
// Un sitio con cadena de transmisión (bajada) y de recepción (subida), perfiles de radio y
// tres mapas: bajada, subida y desbalance.

import { BALANCE_LEGEND, DEFAULT_LEVEL_THRESHOLDS_DBM, LEVEL_COLORS, levelBandLabels } from '../../coverage/colorScale';
import type { CoverageResult } from '../../coverage/computeCoverage';
import { TALK_IN, TALK_OUT, itmSpec, lmrCoverageRequest } from '../../coverage/inputs';
import { buildRasterGeometry, type RasterGeometry } from '../../coverage/raster';
import { renderCoverage, type CoverageGrids, type CoverageView } from '../../coverage/render';
import {
  DEFAULT_RADIO_PROFILE_ID,
  DEFAULT_RADIUS_KM,
  LMR_BANDS,
  RADIO_PROFILES,
  type LmrBandId,
} from '../../data/defaults';
import { deviceLoss, type DeviceLoss, type DevicePath } from '../../devices/deviceLoss';
import { evaluateDevice, matchProfileId } from '../../devices/devices';
import { downloadCoverageKmz } from '../../export/coverageKmz';
import { exportFileName, type KmlPlacemark } from '../../export/kml';
import { SHARE_NOTICE_HTML, showSharedNotice } from '../../export/shareButton';
import { SHARE_BROKEN_MESSAGE } from '../../export/shareLink';
import { createCoverageLayer } from '../../map/coverageLayer';
import { addExportControl } from '../../map/exportControl';
import { addShareControl } from '../../map/shareControl';
import { talkInBudget, talkOutBudget, type RadioProfile, type SiteRxChain, type SiteTxChain } from '../../rf/linkBudget';
import { balanceSummary, budgetRows, createBudgetPanel } from '../../ui/budgetPanel';
import { createRadioForm, createRxForm, createTxForm } from '../../ui/chainForms';
import { createMapLegend } from '../../ui/coverageLegend';
import { createReliabilityControl, parseReliability, requestReliability } from '../../ui/reliabilityControl';
import { CHOOSE_CLUTTER_REASON, clutterQuery, clutterSummary, createClutterControl, formatClutterDb, parseRequiredClutter } from '../../ui/clutterControl';
import { createDeviceList, isOverDevice, type Device, type DeviceList } from '../../ui/deviceList';
import { createTrunkingCapacity } from '../../ui/trunkingCapacity';
import { formatDistance, formatHeight, formatLonLat, formatMHz } from '../../ui/format';
import { createHoverReadout, readoutLines } from '../../ui/hoverReadout';
import { infoButton, setInfo } from '../../ui/infoTip';
import { replaceQuery, type PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindChoice, choiceHtml, coverageStatusHtml, createMapPage, siteSectionHtml } from '../shared/mapPage';
import { createRequestMemo } from '../shared/requestMemo';
import { createSiteControls } from '../shared/siteControls';
import { readTerrainShare, terrainShareData } from './terrainShare';

const VIEWS: { id: CoverageView; label: string; title: string }[] = [
  { id: 'talkOut', label: 'Bajada', title: 'Nivel recibido en el radio (dBm)' },
  { id: 'talkIn', label: 'Subida', title: 'Nivel recibido en el sitio (dBm)' },
  { id: 'balance', label: 'Desbalance', title: 'Dónde llega cada dirección' },
];

const kmFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, signDisplay: 'auto' });
const marginFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const LEVEL_EMPTY_LABEL = 'no llega a la sensibilidad';
const HATCH_LABEL = 'baja confianza (ladera empinada junto al sitio)';

const viewTitle = (id: CoverageView) => VIEWS.find((v) => v.id === id)!.title;

/** Franjas de nivel de una dirección, de la más fuerte a la sensibilidad. */
const levelEntries = (sensitivityDbm: number, thresholds: readonly number[]) =>
  levelBandLabels(sensitivityDbm, thresholds).flatMap((label, i) => (label ? [{ color: LEVEL_COLORS[i]!, label }] : []));

const gridsOf = (result: CoverageResult): CoverageGrids => ({
  talkOut: result.grids[TALK_OUT]!,
  talkIn: result.grids[TALK_IN]!,
});

export function mountLmrPage({ root, params, shared }: PageContext): () => void {
  const initialBand = LMR_BANDS.find((b) => b.id === params.get('banda')) ?? LMR_BANDS.find((b) => b.id === '800')!;
  // Enlace de "Compartir": la página abre con esos datos o, si no sirven, con los de siempre.
  const fromLink = shared?.ok ? readTerrainShare(shared.data, initialBand) : null;
  const opened = shared && (shared.ok && !fromLink ? { ok: false as const, message: SHARE_BROKEN_MESSAGE } : shared);

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Radiocomunicaciones en terreno${infoButton('Trunking P25, SmartZone y convencional. Bajada y subida por separado, cada una con su frecuencia y su cadena.')}</h2>
      ${choiceHtml('banda', LMR_BANDS.map((b) => ({ id: b.id, label: b.label })), 'Banda', '')}
      <div class="form" data-reliability-form></div>
      ${SHARE_NOTICE_HTML}
    </section>
    ${siteSectionHtml()}
    ${coverageStatusHtml()}
    <details class="panel-section" open>
      <summary>Radio de usuario</summary>
      <div class="form" data-radio-form></div>
      <div class="form" data-clutter-form></div>
    </details>
    <details class="panel-section" open>
      <summary>Equipos${infoButton('Radios concretos, por ejemplo los 20 portátiles de una cuadrilla: agrégalos con clic en el mapa o pega su lista. Cada uno se calcula con el ITM punto a punto desde el sitio, a su propia altura y con su perfil.')}</summary>
      <div data-devices></div>
    </details>
    <details class="panel-section">
      <summary>Capacidad${infoButton('Cuántas llamadas esperan canal en la hora pico, según los radios, cuánto hablan y los canales de voz del sitio.')}</summary>
      <div data-capacity></div>
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
  let tx = fromLink?.tx ?? band.tx;
  let rx = fromLink?.rx ?? band.rx;
  let radio = fromLink?.radio ?? RADIO_PROFILES.find((p) => p.id === DEFAULT_RADIO_PROFILE_ID)!;
  let view: CoverageView = 'talkOut';
  let thresholds = fromLink?.thresholds ?? [...DEFAULT_LEVEL_THRESHOLDS_DBM];
  let opacity = 0.7;
  let coverage: CoverageResult | null = null;
  let geometry: RasterGeometry | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const bandRange = page.find('[data-choice-info="banda"]');
  const showBandRange = () => setInfo(bandRange, `Banda ${band.label}: ${band.range}.`);
  showBandRange();

  const exporter = addExportControl(page.map, [
    { label: 'KMZ para Google Earth', description: 'Bajada y subida con sus leyendas, el sitio y los radios con su ficha.', run: exportKmz },
  ]);

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

  const site = createSiteControls(page, {
    radiusKm: fromLink?.radiusKm ?? DEFAULT_RADIUS_KM,
    maxRadiusKm: 100,
    initial: fromLink ?? undefined,
    onChange: onParametersChange,
  });
  const controller = createCoverageController(
    page.find('[data-coverage-status]'),
    page.find('[data-simulate-box]'),
    (result) => {
      coverage = result;
      geometry = buildRasterGeometry(result.plan);
      pixels = new Uint8ClampedArray(geometry.width * geometry.height * 4);
      exporter.setEnabled(true);
      redraw();
    },
    'bajada y subida',
  );

  createRadioForm(page.find('[data-radio-form]'), radio, (next) => {
    radio = next;
    onParametersChange();
  });
  // Sin valor por omisión: el usuario elige el entorno antes de simular (undefined = sin elegir).
  let clutter = parseRequiredClutter(params);
  let reliability = parseReliability(params, 90);
  createReliabilityControl(page.find('[data-reliability-form]'), reliability, (next) => {
    reliability = next;
    replaceQuery('confiabilidad', next === 90 ? null : String(next));
    onParametersChange();
  });
  createClutterControl(page.find('[data-clutter-form]'), clutter, (next) => {
    clutter = next;
    const query = clutterQuery(clutter, true);
    replaceQuery('entorno', query.entorno);
    replaceQuery('altura-entorno', query.altura);
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
  // Radios concretos: la pérdida de cada trayecto se guarda, así cambiar la potencia o la
  // sensibilidad no vuelve a correr el ITM; solo se recalcula si cambia la geometría.
  const lossCache = new Map<string, Promise<DeviceLoss>>();
  const radioOf = (d: Device) => RADIO_PROFILES.find((p) => p.id === d.profileId) ?? radio;
  const capacity = createTrunkingCapacity(page.find('[data-capacity]'), fromLink?.capacity);
  let deviceList: DeviceList | undefined;
  deviceList = createDeviceList(page, page.find('[data-devices]'), {
    onCountChange: (count) => capacity.setDeviceCount(count),
    columns: ['Bajada', 'Subida', 'Margen'],
    units: ['dBm', 'dBm', ''],
    noun: { one: 'radio', many: 'radios' },
    profiles: RADIO_PROFILES,
    profileName: (id) => RADIO_PROFILES.find((p) => p.id === id)?.name ?? radio.name,
    matchProfile: (text) => matchProfileId(text, RADIO_PROFILES),
    async evaluate(device) {
      const location = site.getSite();
      if (!location || clutter === undefined) return null;
      const r = radioOf(device);
      const path: DevicePath = {
        site: location,
        device: device.position,
        deviceHeightM: r.heightM,
        down: { siteHeightM: tx.antennaHeightM, frequencyMHz: tx.frequencyMHz },
        up: { siteHeightM: rx.antennaHeightM, frequencyMHz: rx.frequencyMHz },
        clutter,
        reliabilityPct: reliability,
      };
      const key = JSON.stringify(path);
      if (!lossCache.has(key)) lossCache.set(key, deviceLoss(path));
      const loss = await lossCache.get(key)!;
      const result = evaluateDevice(talkOutBudget(tx, r), talkInBudget(rx, r), loss.downDb, loss.upDb);
      const dbm = (v: number) => (Number.isNaN(v) ? '—' : integerFormat.format(v).replace('−', '-'));
      // El margen que manda es el de la dirección más débil.
      const margin = Math.min(result.downMarginDb, result.upMarginDb);
      return {
        cells: [dbm(result.downDbm), dbm(result.upDbm), Number.isNaN(margin) ? '—' : `${marginFormat.format(margin).replace('−', '-')} dB`],
        status: result.status,
        detail: `A ${formatDistance(loss.distanceM)} del sitio${loss.clutterUpDb > 0 ? ` · entorno ${formatClutterDb(loss.clutterUpDb)}` : ''}`,
      };
    },
    fileName: () => exportFileName('terreno-equipos', band.label, site.getSite() ?? { lon: 0, lat: 0 }, 'csv', site.getName()).replace(/\.csv$/, ''),
    initial: fromLink?.devices,
  });

  showSharedNotice(page.panel, opened);
  addShareControl(page.map, {
    title: () => `Hertzo · Terreno ${band.label}${site.getName() ? ` · ${site.getName()}` : ''}`,
    data: () =>
      terrainShareData(
        {
          site: site.getSite(),
          name: site.getName(),
          radiusKm: site.getRadiusKm(),
          tx,
          rx,
          radio,
          thresholds,
          capacity: capacity.changed(),
          devices: (deviceList?.devices() ?? []).map(({ name, position, profileId }) => ({ name, position, profileId })),
        },
        band,
      ),
  });

  bindChoice(page.panel, 'banda', band.id, (id) => {
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
    const { down, up } = mapBudgets(coverage);
    renderCoverage(geometry, gridsOf(coverage), view, down, up, thresholds, pixels);
    coverageLayer.draw(geometry, pixels);
    const isLevel = view !== 'balance';
    const sensitivity = view === 'talkIn' ? up.sensitivityDbm : down.sensitivityDbm;
    legend.update({
      views: VIEWS,
      activeView: view,
      title: coverage ? `${viewTitle(view)} · ${requestReliability(coverage.request)} % de confiabilidad` : viewTitle(view),
      entries: isLevel
        ? levelEntries(sensitivity, thresholds)
        : BALANCE_LEGEND.map((e) => ({ color: e.color, label: e.label })),
      emptyLabel: isLevel ? LEVEL_EMPTY_LABEL : 'no llega ninguna',
      hatchLabel: HATCH_LABEL,
      thresholds: isLevel ? { values: thresholds, unit: 'dBm', min: -150, max: -20 } : undefined,
      opacity,
    });
  }

  /**
   * Descarga un KMZ con la bajada y la subida en carpetas separadas, cada una con su leyenda,
   * con los mismos colores, umbrales y opacidad del mapa, y el sitio con su ficha.
   */
  async function exportKmz() {
    if (!coverage) return;
    const grids = gridsOf(coverage);
    // Con los datos del cálculo que muestra el mapa, aunque el formulario ya tenga otros.
    const shown = mapChain(coverage);
    const { tx, rx, radio } = shown;
    const { down, up } = mapBudgets(coverage);
    const directions = [
      { view: 'talkOut', label: 'Bajada', file: 'bajada', frequencyMHz: tx.frequencyMHz, sensitivityDbm: down.sensitivityDbm },
      { view: 'talkIn', label: 'Subida', file: 'subida', frequencyMHz: rx.frequencyMHz, sensitivityDbm: up.sensitivityDbm },
    ] as const;
    const layers = directions.map((d) => ({
      name: `${d.label} · ${formatMHz(d.frequencyMHz)}`,
      file: d.file,
      paint: (g: RasterGeometry, out: Uint8ClampedArray<ArrayBuffer>) =>
        renderCoverage(g, grids, d.view, down, up, thresholds, out),
      legend: {
        title: viewTitle(d.view),
        entries: levelEntries(d.sensitivityDbm, thresholds),
        emptyLabel: LEVEL_EMPTY_LABEL,
        hatchLabel: HATCH_LABEL,
      },
    }));

    const { site: position, radiusM } = coverage.plan;
    const name = site.getName();
    const placemark: KmlPlacemark = {
      name: `${name || 'Sitio'} · ${band.label}`,
      position,
      tables: [
        {
          rows: [
            ['Ubicación (lat, lon)', formatLonLat(position.lon, position.lat)],
            ['Banda', `${band.label} (${band.range})`],
            ['Antena de transmisión', `${formatHeight(tx.antennaHeightM)} sobre el terreno`],
            ['Antena de recepción', `${formatHeight(rx.antennaHeightM)} sobre el terreno`],
            ['Radio de cálculo', `${kmFormat.format(radiusM / 1000)} km`],
            ['Entorno del equipo', clutterSummary(coverage.request)?.replace(/^Entorno /, '') ?? 'Sin entorno (solo relieve)'],
          ],
        },
        {
          title: 'Radio de usuario',
          rows: [
            ['Perfil', radio.name],
            ['Altura de la antena', formatHeight(radio.heightM)],
          ],
        },
        {
          title: 'Balance de enlace',
          header: ['', 'Bajada', 'Subida'],
          rows: budgetRows(down, up),
          note: balanceSummary(down, up),
        },
      ],
    };
    await downloadCoverageKmz({
      documentName: `Hertzo · Terreno ${band.label}${name ? ` · ${name}` : ''}`,
      fileName: exportFileName('terreno', band.label, position, 'kmz', name),
      plan: coverage.plan,
      layers,
      opacity,
      site: placemark,
      devices: deviceList && { folderName: `Radios (${deviceList.placemarks().length})`, placemarks: deviceList.placemarks() },
    });
  }

  /** Cadenas con que se calculó el mapa visible (las de ahora si no hay que volver a simular). */
  const chainMemo = createRequestMemo<{ tx: SiteTxChain; rx: SiteRxChain; radio: RadioProfile }>();
  const mapChain = (result: CoverageResult) => chainMemo.forResult(result, { tx, rx, radio });
  const mapBudgets = (result: CoverageResult) => {
    const c = mapChain(result);
    return { down: talkOutBudget(c.tx, c.radio), up: talkInBudget(c.rx, c.radio) };
  };

  function onParametersChange() {
    showBudget(talkOutBudget(tx, radio), talkInBudget(rx, radio));
    const location = site.getSite();
    const request = location && clutter !== undefined ? lmrCoverageRequest(location, site.getRadiusKm() * 1000, tx, rx, radio, itmSpec(clutter ?? null, reliability)) : null;
    chainMemo.remember(request, { tx, rx, radio });
    redraw();
    controller.setRequest(request);
    controller.setBlocked(location && clutter === undefined ? CHOOSE_CLUTTER_REASON : null);
    deviceList?.refresh();
  }

  const readout = createHoverReadout(page.readoutRoot);
  page.map.on('mousemove', (event) => {
    // Sobre un equipo manda su propio globo.
    if (isOverDevice(event.originalEvent)) return;
    const lines =
      coverage &&
      readoutLines(coverage, mapBudgets(coverage).down, mapBudgets(coverage).up, {
        lon: event.lngLat.lng,
        lat: event.lngLat.lat,
      });
    const entorno = coverage && clutterSummary(coverage.request);
    if (lines && entorno) lines.push(entorno);
    if (lines) readout.show(lines, event.point.x, event.point.y);
    else readout.hide();
  });
  page.map.on('mouseout', () => readout.hide());

  onParametersChange();

  return () => {
    deviceList?.destroy();
    controller.destroy();
    page.destroy();
  };
}
