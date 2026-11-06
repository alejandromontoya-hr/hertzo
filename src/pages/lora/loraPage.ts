// LoRaWAN: un gateway y sus sensores sobre el terreno real. Bajada (gateway → sensor) y subida
// (sensor → gateway) por separado, con su canal y su ancho de banda, y el mapa del SF más
// rápido con el que el gateway todavía oye al sensor.

import { BALANCE_LEGEND, DEFAULT_LEVEL_THRESHOLDS_DBM, LEVEL_COLORS, levelBandLabels } from '../../coverage/colorScale';
import type { CoverageResult } from '../../coverage/computeCoverage';
import { TALK_IN, TALK_OUT, lmrCoverageRequest } from '../../coverage/inputs';
import { SF_COLORS, renderSpreadingFactor } from '../../coverage/loraRender';
import { buildRasterGeometry, gridIndexAt, type RasterGeometry } from '../../coverage/raster';
import { renderCoverage, type CoverageGrids, type CoverageView } from '../../coverage/render';
import {
  DEFAULT_LORA_BAND_ID,
  DEFAULT_LORA_GATEWAY,
  DEFAULT_LORA_SENSOR_ID,
  LORA_BANDS,
  LORA_SENSORS,
  gatewayRxChain,
  gatewayTxChain,
  sensorRadioProfile,
  type LoraBandId,
  type LoraGateway,
  type LoraSensor,
} from '../../data/lora';
import { deviceLoss, type DeviceLoss, type DevicePath } from '../../devices/deviceLoss';
import { evaluateDevice } from '../../devices/devices';
import { downloadCoverageKmz } from '../../export/coverageKmz';
import { exportFileName, type KmlPlacemark } from '../../export/kml';
import { createCoverageLayer } from '../../map/coverageLayer';
import { addExportControl } from '../../map/exportControl';
import { receivedPowerDbm, talkInBudget, talkOutBudget } from '../../rf/linkBudget';
import {
  AU915_DWELL_TIME_MS,
  SPREADING_FACTORS,
  loraSensitivityDbm,
  loraTimeOnAirMs,
  maxSpreadingFactorForDwell,
  minimumSpreadingFactor,
  type SpreadingFactor,
} from '../../rf/lora';
import { LORA_BUDGET_NAMES, balanceSummary, budgetRows, createBudgetPanel } from '../../ui/budgetPanel';
import { createMapLegend } from '../../ui/coverageLegend';
import { createDeviceList, type Device, type DeviceList } from '../../ui/deviceList';
import { createLoraCapacity } from '../../ui/loraCapacity';
import { createFieldGroup, createNumberField, type NumberFieldSpec } from '../../ui/fields';
import { formatDbm, formatHeight, formatLonLat, formatMHz } from '../../ui/format';
import { createHoverReadout, readoutLines } from '../../ui/hoverReadout';
import { infoButton, setInfo } from '../../ui/infoTip';
import { replaceQuery, type PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindChoice, choiceHtml, coverageStatusHtml, createMapPage, siteSectionHtml } from '../shared/mapPage';
import { createSiteControls } from '../shared/siteControls';

type LoraView = CoverageView | 'sf';

const VIEWS: { id: LoraView; label: string; title: string }[] = [
  { id: 'talkOut', label: 'Bajada', title: 'Nivel recibido en el sensor (dBm)' },
  { id: 'talkIn', label: 'Subida', title: 'Nivel recibido en el gateway (dBm)' },
  { id: 'balance', label: 'Desbalance', title: 'Dónde llega cada dirección' },
  { id: 'sf', label: 'SF', title: 'SF más rápido de la subida' },
];

/** LoRaWAN suma 13 bytes de encabezado y MIC a lo que manda el sensor. */
const LORAWAN_OVERHEAD_BYTES = 13;
const DEFAULT_PAYLOAD_BYTES = 11;
const DEFAULT_RADIUS_KM = 20;
const CUSTOM_SENSOR_ID = 'personalizado';

const kmFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const integerDbm = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const msFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const LEVEL_EMPTY_LABEL = 'no llega ni con SF12';
const HATCH_LABEL = 'baja confianza (ladera empinada junto al gateway)';

const viewTitle = (id: LoraView) => VIEWS.find((v) => v.id === id)!.title;

const levelEntries = (sensitivityDbm: number, thresholds: readonly number[]) =>
  levelBandLabels(sensitivityDbm, thresholds).map((label, i) => ({ color: LEVEL_COLORS[i]!, label }));

const gridsOf = (result: CoverageResult): CoverageGrids => ({
  talkOut: result.grids[TALK_OUT]!,
  talkIn: result.grids[TALK_IN]!,
});

type GatewayValues = Omit<LoraGateway, never>;
type SensorValues = Omit<LoraSensor, 'id' | 'name'>;

const GATEWAY_FIELDS: readonly NumberFieldSpec<keyof GatewayValues>[] = [
  {
    key: 'powerW',
    label: 'Potencia',
    unit: 'W',
    min: 0,
    max: 10,
    minExclusive: true,
    hint: 'En Colombia (915–928 MHz), máximo 1 W a la salida del equipo con antena de hasta 6 dBi; con más ganancia, la potencia baja lo mismo que sobra (ANE, Resolución 105 de 2020, anexo 3.6.1.1).',
  },
  { key: 'lineLengthM', label: 'Longitud del cable', unit: 'm', min: 0, max: 200 },
  { key: 'lineLossDbPer100m', label: 'Pérdida del cable', unit: 'dB/100 m', min: 0, max: 50 },
  { key: 'connectorLossDb', label: 'Pérdida de conectores', unit: 'dB', min: 0, max: 10 },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena', unit: 'dBd', min: -10, max: 20 },
  { key: 'antennaHeightM', label: 'Altura de la antena', unit: 'm', min: 0.5, max: 1000 },
  {
    key: 'noiseFigureDb',
    label: 'Figura de ruido',
    unit: 'dB',
    min: 0,
    max: 20,
    hint: 'Ruido que agrega el receptor. Con 4 dB el gateway oye SF12 hasta −139 dBm, como el Semtech SX1302.',
  },
];

const SENSOR_FIELDS: readonly NumberFieldSpec<keyof SensorValues>[] = [
  { key: 'powerW', label: 'Potencia', unit: 'W', min: 0, max: 1, minExclusive: true },
  { key: 'antennaGainDbd', label: 'Ganancia de la antena', unit: 'dBd', min: -20, max: 10 },
  { key: 'heightM', label: 'Altura de la antena', unit: 'm', min: 0.5, max: 100 },
  {
    key: 'enclosureLossDb',
    label: 'Pérdida por la caja',
    unit: 'dB',
    min: 0,
    max: 40,
    hint: 'Lo que atenúa la caja, la tapa o el muro que rodea al sensor. Aplica en bajada y en subida.',
  },
  { key: 'noiseFigureDb', label: 'Figura de ruido', unit: 'dB', min: 0, max: 20 },
];

export function mountLoraPage({ root, params }: PageContext): () => void {
  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>LoRaWAN${infoButton('Un gateway y sus sensores sobre el terreno real. Bajada y subida por separado: en AU915 y US915 la subida va en canales de 125 kHz y la bajada en canales de 500 kHz.')}</h2>
      ${choiceHtml('banda', LORA_BANDS.map((b) => ({ id: b.id, label: `${b.label} (${b.range})` })), 'Plan de frecuencias', '')}
      <div data-dwell-box>
        ${choiceHtml(
          'tiempo',
          [
            { id: 'libre', label: 'Sin límite' },
            { id: '400', label: 'Hasta 400 ms (dwell time)' },
          ],
          'Tiempo máximo por mensaje',
          'En AU915 la red puede limitar cada mensaje a 400 ms en el aire. Con 11 bytes, SF11 y SF12 tardan más, así que no se pueden usar y la subida llega hasta SF10.',
        )}
      </div>
    </section>
    ${siteSectionHtml('Gateway', 'el gateway')}
    ${coverageStatusHtml()}
    <details class="panel-section" open>
      <summary>Sensor</summary>
      <div class="form" data-sensor-form></div>
    </details>
    <details class="panel-section" open>
      <summary>Equipos${infoButton('Medidores o sensores concretos: agrégalos con clic en el mapa o pega su lista. Cada uno se calcula con el ITM punto a punto desde el gateway, a su propia altura.')}</summary>
      <div data-devices></div>
    </details>
    <details class="panel-section">
      <summary>Capacidad${infoButton('Qué parte de los mensajes choca en el aire, según cuántos medidores hay, cada cuánto envían y con qué SF.')}</summary>
      <div data-capacity></div>
    </details>
    <details class="panel-section">
      <summary>Gateway · antena y cable</summary>
      <div class="form" data-gateway-form></div>
    </details>
    <section class="panel-section">
      <h2>Balance de enlace</h2>
      <div data-budget></div>
    </section>
    <section class="panel-section">
      <h2>SF y tiempo en el aire${infoButton('Cuánto aguanta el gateway con cada SF y cuánto dura cada mensaje. Más tiempo en el aire es más batería gastada y más ocupación del canal.')}</h2>
      <div class="form" data-payload-form></div>
      <div data-sf-table></div>
    </section>`,
    'Parámetros del gateway LoRaWAN',
  );

  let band = LORA_BANDS.find((b) => b.id === params.get('banda')) ?? LORA_BANDS.find((b) => b.id === DEFAULT_LORA_BAND_ID)!;
  let gateway: LoraGateway = { ...DEFAULT_LORA_GATEWAY };
  let sensor: LoraSensor = LORA_SENSORS.find((s) => s.id === DEFAULT_LORA_SENSOR_ID)!;
  let payloadBytes = DEFAULT_PAYLOAD_BYTES;
  let dwellLimit = params.get('tiempo') === '400';
  let view: LoraView = 'talkIn';
  let thresholds = [...DEFAULT_LEVEL_THRESHOLDS_DBM];
  let opacity = 0.7;
  let coverage: CoverageResult | null = null;
  let geometry: RasterGeometry | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const tx = () => gatewayTxChain(band, gateway);
  /** SF más lento permitido: SF12, o el que cabe en 400 ms si la red de AU915 lo exige. */
  const maxSf = (): SpreadingFactor =>
    dwellLimit && band.id === 'au915'
      ? (maxSpreadingFactorForDwell(band.uplink.bandwidthKHz, payloadBytes + LORAWAN_OVERHEAD_BYTES) ?? 7)
      : 12;
  const rx = () => gatewayRxChain(band, gateway, maxSf());
  const radio = () => sensorRadioProfile(band, sensor);
  const budgets = () => ({ down: talkOutBudget(tx(), radio()), up: talkInBudget(rx(), radio()) });
  const timeOnAir = (sf: (typeof SPREADING_FACTORS)[number]) =>
    loraTimeOnAirMs({ spreadingFactor: sf, bandwidthKHz: band.uplink.bandwidthKHz, payloadBytes: payloadBytes + LORAWAN_OVERHEAD_BYTES });

  const bandInfo = page.find('[data-choice-info="banda"]');
  const showBandInfo = () =>
    setInfo(
      bandInfo,
      `${band.description} Subida en ${formatMHz(band.uplink.frequencyMHz)} a ${band.uplink.bandwidthKHz} kHz; bajada en ${formatMHz(band.downlink.frequencyMHz)} a ${band.downlink.bandwidthKHz} kHz.`,
    );
  showBandInfo();

  const exporter = addExportControl(page.map, [
    { label: 'KMZ para Google Earth', description: 'Bajada, subida y SF con sus leyendas, el gateway y los medidores con su ficha.', run: exportKmz },
  ]);

  const showBudget = createBudgetPanel(page.find('[data-budget]'), LORA_BUDGET_NAMES);
  const coverageLayer = createCoverageLayer(page.map, opacity);
  const legend = createMapLegend(page.legendRoot, {
    onView(id) {
      view = id as LoraView;
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

  // Sensor: elegir un perfil carga sus valores; editar un campo lo pasa a "Personalizado".
  const sensorForm = page.find('[data-sensor-form]');
  const sensorSelect = document.createElement('div');
  sensorSelect.className = 'field field-select';
  sensorSelect.innerHTML = '<label for="perfil-sensor">Tipo</label><select id="perfil-sensor"></select>';
  const select = sensorSelect.querySelector('select')!;
  for (const s of LORA_SENSORS) select.add(new Option(s.name, s.id));
  select.add(new Option('Personalizado', CUSTOM_SENSOR_ID));
  select.value = sensor.id;
  sensorForm.append(sensorSelect);
  const sensorFields = createFieldGroup<SensorValues>(sensorForm, SENSOR_FIELDS, sensor, (values) => {
    sensor = { ...values, id: CUSTOM_SENSOR_ID, name: 'Personalizado' };
    select.value = CUSTOM_SENSOR_ID;
    onParametersChange();
  });
  select.addEventListener('change', () => {
    sensor = LORA_SENSORS.find((s) => s.id === select.value) ?? { ...sensor, id: CUSTOM_SENSOR_ID, name: 'Personalizado' };
    sensorFields.setValues(sensor);
    onParametersChange();
  });

  createFieldGroup<GatewayValues>(page.find('[data-gateway-form]'), GATEWAY_FIELDS, gateway, (values) => {
    gateway = values;
    onParametersChange();
  });

  const payloadField = createNumberField(
    {
      key: 'payloadBytes',
      label: 'Datos por mensaje',
      unit: 'bytes',
      min: 1,
      max: 222,
      hint: 'Lo que manda el sensor en cada mensaje. LoRaWAN le suma 13 bytes de encabezado.',
    },
    payloadBytes,
    (value) => {
      payloadBytes = Math.round(value);
      // Con el límite de 400 ms, el tamaño del mensaje cambia el SF más lento permitido.
      onParametersChange();
      redraw();
    },
  );
  page.find('[data-payload-form]').append(payloadField.element);

  const sfTable = page.find('[data-sf-table]');
  function showSfTable() {
    const rows = SPREADING_FACTORS.map(
      (sf) =>
        sf > maxSf()
          ? `<tr><th scope="row">SF${sf}</th><td>no permitido</td><td>${msFormat.format(timeOnAir(sf))} ms &gt; ${AU915_DWELL_TIME_MS}</td></tr>`
          : `<tr><th scope="row">SF${sf}</th><td>${formatDbm(loraSensitivityDbm(sf, band.uplink.bandwidthKHz, gateway.noiseFigureDb))}</td><td>${msFormat.format(timeOnAir(sf))} ms</td></tr>`,
    ).join('');
    sfTable.innerHTML = `
      <table class="budget">
        <thead><tr><th></th><th>El gateway oye hasta</th><th>Tiempo en el aire</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // Equipos concretos: la pérdida de cada trayecto se guarda, así cambiar la potencia o la
  // figura de ruido no vuelve a correr el ITM; solo se recalcula si cambia la geometría.
  const lossCache = new Map<string, Promise<DeviceLoss>>();
  const sensorOf = (d: Device) => LORA_SENSORS.find((s) => s.id === d.profileId) ?? sensor;
  /** SF de subida de cada equipo evaluado, para la capacidad. */
  const sfById = new Map<number, SpreadingFactor | null>();
  const capacity = createLoraCapacity(page.find('[data-capacity]'), {
    deviceSfs: () => deviceList?.devices().map((d) => sfById.get(d.id) ?? null) ?? [],
    timeOnAirMs: (sf) => timeOnAir(sf),
    maxSf,
  });
  let deviceList: DeviceList | undefined;
  deviceList = createDeviceList(page, page.find('[data-devices]'), {
    onCountChange: (count) => capacity.setDeviceCount(count),
    onRowsChange: () => capacity.update(),
    columns: ['Bajada', 'Subida', 'SF'],
    units: ['dBm', 'dBm', ''],
    noun: { one: 'medidor', many: 'medidores' },
    profiles: LORA_SENSORS,
    profileName: (id) => LORA_SENSORS.find((s) => s.id === id)?.name ?? sensor.name,
    matchProfile(text) {
      const t = text.trim().toLowerCase();
      return LORA_SENSORS.find((s) => s.id === t || s.name.toLowerCase() === t || s.name.toLowerCase().includes(t))?.id ?? null;
    },
    async evaluate(device) {
      const location = site.getSite();
      if (!location) return null;
      const s = sensorOf(device);
      const path: DevicePath = {
        site: location,
        device: device.position,
        deviceHeightM: s.heightM,
        down: { siteHeightM: gateway.antennaHeightM, frequencyMHz: band.downlink.frequencyMHz },
        up: { siteHeightM: gateway.antennaHeightM, frequencyMHz: band.uplink.frequencyMHz },
      };
      const key = JSON.stringify(path);
      if (!lossCache.has(key)) lossCache.set(key, deviceLoss(path));
      const loss = await lossCache.get(key)!;
      const profile = sensorRadioProfile(band, s);
      const r = evaluateDevice(talkOutBudget(tx(), profile), talkInBudget(rx(), profile), loss.downDb, loss.upDb);
      const sf = Number.isNaN(r.upDbm) ? null : minimumSpreadingFactor(r.upDbm, band.uplink.bandwidthKHz, gateway.noiseFigureDb, maxSf());
      sfById.set(device.id, sf);
      const dbm = (v: number) => (Number.isNaN(v) ? '—' : integerDbm.format(v));
      return {
        cells: [dbm(r.downDbm), dbm(r.upDbm), sf === null ? '—' : `SF${sf}`],
        status: r.status,
        detail: `A ${kmFormat.format(loss.distanceM / 1000)} km del gateway · bajada ${dbm(r.downDbm)} dBm · subida ${dbm(r.upDbm)} dBm`,
      };
    },
    fileName: () => exportFileName('lora-equipos', band.label, site.getSite() ?? { lon: 0, lat: 0 }, 'csv', site.getName()).replace(/\.csv$/, ''),
  });

  /** "no llega ni con SF12", o "ni con SF10" si el límite de 400 ms deja hasta SF10. */
  const emptyLabel = () => `no llega ni con SF${maxSf()}`;

  const dwellBox = page.find('[data-dwell-box]');
  const showDwellBox = () => (dwellBox.hidden = band.id !== 'au915');
  showDwellBox();
  bindChoice(page.panel, 'tiempo', dwellLimit ? '400' : 'libre', (id) => {
    dwellLimit = id === '400';
    replaceQuery('tiempo', dwellLimit ? '400' : null);
    onParametersChange();
  });

  bindChoice(page.panel, 'banda', band.id, (id) => {
    band = LORA_BANDS.find((b) => b.id === (id as LoraBandId))!;
    showBandInfo();
    showDwellBox();
    replaceQuery('banda', band.id);
    onParametersChange();
  });

  /** Vuelve a pintar el mapa visible con el último cálculo y el balance actual (sin recalcular). */
  function redraw() {
    if (!coverage || !geometry || !pixels) return;
    const { down, up } = budgets();
    const grids = gridsOf(coverage);
    if (view === 'sf') {
      renderSpreadingFactor(geometry, grids.talkIn, up, band.uplink.bandwidthKHz, gateway.noiseFigureDb, pixels, maxSf());
    } else {
      renderCoverage(geometry, grids, view, down, up, thresholds, pixels);
    }
    coverageLayer.draw(geometry, pixels);
    legend.update({
      views: VIEWS,
      activeView: view,
      title: viewTitle(view),
      ...legendFor(view),
      hatchLabel: HATCH_LABEL,
      opacity,
    });
  }

  function legendFor(v: LoraView) {
    const { down, up } = budgets();
    if (v === 'sf') {
      return {
        entries: SPREADING_FACTORS.filter((sf) => sf <= maxSf()).map((sf) => ({
          color: SF_COLORS[sf],
          label: `SF${sf} · ${msFormat.format(timeOnAir(sf))} ms en el aire`,
        })),
        emptyLabel: emptyLabel(),
        thresholds: undefined,
      };
    }
    if (v === 'balance') {
      return { entries: BALANCE_LEGEND.map((e) => ({ color: e.color, label: e.label })), emptyLabel: 'no llega ninguna', thresholds: undefined };
    }
    return {
      entries: levelEntries(v === 'talkIn' ? up.sensitivityDbm : down.sensitivityDbm, thresholds),
      emptyLabel: v === 'talkIn' ? emptyLabel() : LEVEL_EMPTY_LABEL,
      thresholds: { values: thresholds, unit: 'dBm', min: -150, max: -20 },
    };
  }

  /** KMZ con bajada, subida y SF en carpetas separadas, y el gateway con su ficha. */
  async function exportKmz() {
    if (!coverage) return;
    const grids = gridsOf(coverage);
    const { down, up } = budgets();
    const layers = (['talkOut', 'talkIn', 'sf'] as const).map((v) => {
      const legendData = legendFor(v);
      const frequencyMHz = v === 'talkOut' ? band.downlink.frequencyMHz : band.uplink.frequencyMHz;
      return {
        name: `${VIEWS.find((x) => x.id === v)!.label} · ${formatMHz(frequencyMHz)}`,
        file: v === 'talkOut' ? 'bajada' : v === 'talkIn' ? 'subida' : 'sf',
        paint: (g: RasterGeometry, out: Uint8ClampedArray<ArrayBuffer>) =>
          v === 'sf'
            ? renderSpreadingFactor(g, grids.talkIn, up, band.uplink.bandwidthKHz, gateway.noiseFigureDb, out, maxSf())
            : renderCoverage(g, grids, v, down, up, thresholds, out),
        legend: { title: viewTitle(v), entries: legendData.entries, emptyLabel: legendData.emptyLabel, hatchLabel: HATCH_LABEL },
      };
    });

    const { site: position, radiusM } = coverage.plan;
    const name = site.getName();
    const placemark: KmlPlacemark = {
      name: `${name || 'Gateway'} · ${band.label}`,
      position,
      tables: [
        {
          rows: [
            ['Ubicación (lat, lon)', formatLonLat(position.lon, position.lat)],
            ['Plan de frecuencias', `${band.label} (${band.range})`],
            ['Antena del gateway', `${formatHeight(gateway.antennaHeightM)} sobre el terreno`],
            ['Radio de cálculo', `${kmFormat.format(radiusM / 1000)} km`],
          ],
        },
        {
          title: 'Sensor',
          rows: [
            ['Tipo', sensor.name],
            ['Altura de la antena', formatHeight(sensor.heightM)],
          ],
        },
        {
          title: 'Balance de enlace',
          header: ['', 'Bajada', 'Subida'],
          rows: budgetRows(down, up, LORA_BUDGET_NAMES),
          note: balanceSummary(down, up, LORA_BUDGET_NAMES),
        },
      ],
    };
    await downloadCoverageKmz({
      documentName: `Hertzo · LoRaWAN ${band.label}${name ? ` · ${name}` : ''}`,
      fileName: exportFileName('lora', band.label, position, 'kmz', name),
      plan: coverage.plan,
      layers,
      opacity,
      site: placemark,
      devices: deviceList && { folderName: `Medidores (${deviceList.placemarks().length})`, placemarks: deviceList.placemarks() },
    });
  }

  function onParametersChange() {
    const { down, up } = budgets();
    showBudget(down, up);
    showSfTable();
    redraw();
    const location = site.getSite();
    controller.setRequest(location && lmrCoverageRequest(location, site.getRadiusKm() * 1000, tx(), rx(), radio()));
    deviceList?.refresh();
    capacity.update();
  }

  const readout = createHoverReadout(page.readoutRoot);
  page.map.on('mousemove', (event) => {
    const point = { lon: event.lngLat.lng, lat: event.lngLat.lat };
    if (!coverage) return readout.hide();
    const { down, up } = budgets();
    const lines = readoutLines(coverage, down, up, point)?.map((l) => l.replace(' del sitio', ' del gateway'));
    if (!lines) return readout.hide();
    const loss = coverage.grids[TALK_IN]!.lossDb[gridIndexAt(coverage.plan, point)]!;
    if (!Number.isNaN(loss)) {
      const sf = minimumSpreadingFactor(receivedPowerDbm(up, loss), band.uplink.bandwidthKHz, gateway.noiseFigureDb, maxSf());
      lines.splice(3, 0, sf === null ? 'SF de subida: no llega ni con SF12' : `SF de subida: SF${sf} (${msFormat.format(timeOnAir(sf))} ms)`);
    }
    readout.show(lines, event.point.x, event.point.y);
  });
  page.map.on('mouseout', () => readout.hide());

  onParametersChange();

  return () => {
    deviceList?.destroy();
    controller.destroy();
    page.destroy();
  };
}
