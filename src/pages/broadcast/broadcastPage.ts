// Radiodifusión FM y AM: intensidad de campo y zonas de servicio de una emisora.
// FM se propaga por línea de vista y difracción sobre el relieve (ITM); AM viaja como onda
// de tierra y depende sobre todo de la conductividad del suelo (Norton cerca y Tierra esférica lejos).

import { LEVEL_COLORS } from '../../coverage/colorScale';
import type { CoverageRequest, CoverageResult } from '../../coverage/computeCoverage';
import { itmSpec } from '../../coverage/inputs';
import { paintBands, bandLabels } from '../../coverage/paint';
import { contourRing } from '../../coverage/contours';
import { areaAboveKm2, gridValues, lowConfidencePixels, pixelAreaKm2 } from '../../coverage/pixelValues';
import { buildRasterGeometry, gridIndexAt, type RasterGeometry } from '../../coverage/raster';
import { downloadCoverageKmz } from '../../export/coverageKmz';
import { exportFileName } from '../../export/kml';
import { SHARE_NOTICE_HTML, showPageNotice, showSharedNotice } from '../../export/shareButton';
import { SHARE_BROKEN_MESSAGE } from '../../export/shareLink';
import { distanceM } from '../../geo/geodesy';
import { createCoverageLayer } from '../../map/coverageLayer';
import { addExportControl } from '../../map/exportControl';
import { addShareControl } from '../../map/shareControl';
import { START_OVER_HTML, openDraft } from '../shared/draft';
import { lowConfidenceMask, type EngineSpec } from '../../propagation/engines';
import {
  dbuvmToMvm,
  erpToEirpDbm,
  fieldFromEirp,
  fieldStrengthDbuvm,
  freeSpaceLossDb,
  kilowattsToDbm,
} from '../../rf/fieldStrength';
import { AM_ANTENNAS, GROUND_TYPES, groundwaveRangeKm } from '../../rf/groundwave';
import { clutterQuery, clutterSummary, createClutterControl, parseClutter } from '../../ui/clutterControl';
import { createMapLegend } from '../../ui/coverageLegend';
import { createFieldGroup, createSelectField } from '../../ui/fields';
import { formatHeight, formatLonLat, formatMHz } from '../../ui/format';
import { setInfo } from '../../ui/infoTip';
import { createHoverReadout } from '../../ui/hoverReadout';
import { createReliabilityControl, parseReliability, requestReliability } from '../../ui/reliabilityControl';
import { replaceQuery, type PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindChoice, choiceHtml, coverageStatusHtml, createMapPage, siteSectionHtml } from '../shared/mapPage';
import { createSiteControls } from '../shared/siteControls';
import {
  AM_FIELDS,
  DEFAULT_AM,
  DEFAULT_AM_ANTENNA_INDEX,
  DEFAULT_FM,
  DEFAULT_GROUND_ID,
  FM_FIELDS,
  FM_MAX_RADIUS_KM,
  MAX_RADIUS_KM,
  SERVICE,
  THRESHOLD_RANGE,
  type AmStation,
  type FmStation,
  type Service,
} from './broadcastFields';
import { broadcastShareData, readBroadcastShare } from './broadcastShare';

/** Nota de las zonas AM: el mapa es de día; de noche la onda de cielo lo reduce. */
const AM_NIGHT_NOTE =
  'Cobertura diurna (onda de tierra, Tierra esférica con k = 4/3). De noche la ionosfera refleja la onda de cielo: las emisoras lejanas en el mismo canal y en los adyacentes interfieren y el área útil se encoge, a veces a una fracción de la diurna. Los umbrales son los contornos del Decreto 1445 de 1995 (numeral 4.21).';

const mvmFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export function mountBroadcastPage({ root, params: urlParams, shared }: PageContext): () => void {
  // Lo que dejaste en este navegador; con un enlace, lo tuyo queda aparte.
  const draft = openDraft('radiodifusion', urlParams, shared !== null);
  const params = draft.params;
  let service: Service = params.get('servicio') === 'am' ? 'am' : 'fm';
  // Enlace de "Compartir": la página abre con esos datos o, si no sirven, con los de siempre.
  const linked = shared?.ok ? readBroadcastShare(shared.data, service) : null;
  const opened = shared && (shared.ok && !linked ? { ok: false as const, message: SHARE_BROKEN_MESSAGE } : shared);
  // Con qué abre la página: el enlace o, si no hay, lo guardado en este navegador.
  const fromLink = linked ?? (draft.data ? readBroadcastShare(draft.data, service) : null);
  let fm: FmStation = fromLink?.fm ?? { ...DEFAULT_FM };
  let am: AmStation = fromLink?.am ?? { ...DEFAULT_AM };
  let amAntenna = fromLink ? AM_ANTENNAS.find((a) => a.id === fromLink.amAntennaId)! : AM_ANTENNAS[DEFAULT_AM_ANTENNA_INDEX]!;
  let ground = GROUND_TYPES.find((g) => g.id === (fromLink?.groundId ?? DEFAULT_GROUND_ID))!;
  let thresholds: number[] = fromLink?.thresholds ?? [...SERVICE[service].thresholds];
  /** FM: entorno del receptor (UIT-R P.2108) y confiabilidad; 50 % es la F(50,50) de la radiodifusión. */
  let clutter = parseClutter(params);
  let reliability = parseReliability(params, 50);
  let opacity = 0.7;
  let coverage: CoverageResult | null = null;
  let geometry: RasterGeometry | null = null;
  let values: Float32Array | null = null;
  let lowConfidence: Uint8Array | null = null;
  let pixels: Uint8ClampedArray<ArrayBuffer> | null = null;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Radiodifusión</h2>
      ${choiceHtml('servicio', [{ id: 'fm', label: 'FM (88 a 108 MHz)' }, { id: 'am', label: 'AM (530 a 1710 kHz)' }], 'Servicio', '')}
      ${SHARE_NOTICE_HTML}
      ${START_OVER_HTML}
    </section>
    ${siteSectionHtml('Transmisor', 'la antena de la emisora')}
    ${coverageStatusHtml()}
    <section class="panel-section">
      <h2>Emisora</h2>
      <div class="form" data-station-form></div>
      <p class="hint" data-station-summary></p>
    </section>
    <details class="panel-section" open data-fm-receiver>
      <summary>Receptor</summary>
      <div class="form" data-reliability-form></div>
      <div class="form" data-clutter-form></div>
    </details>
    <section class="panel-section">
      <h2>Zonas de servicio</h2>
      <div data-zones><p class="hint">Ubica el transmisor y pulsa "Simular" para ver el alcance de cada zona.</p></div>
    </section>`,
    'Parámetros de la emisora',
  );

  const serviceHint = page.find('[data-choice-info="servicio"]');
  const stationForm = page.find('[data-station-form]');
  const stationSummary = page.find('[data-station-summary]');
  const zones = page.find('[data-zones]');
  const fmReceiver = page.find('[data-fm-receiver]');
  createReliabilityControl(page.find('[data-reliability-form]'), reliability, (next) => {
    reliability = next;
    replaceQuery('confiabilidad', next === 50 ? null : String(next));
    onChange();
  });
  createClutterControl(page.find('[data-clutter-form]'), clutter, (next) => {
    clutter = next;
    const query = clutterQuery(clutter);
    replaceQuery('entorno', query.entorno);
    replaceQuery('altura-entorno', query.altura);
    onChange();
  });
  const exporter = addExportControl(page.map, [
    { label: 'KMZ para Google Earth', description: 'Campo con su leyenda, contornos por umbral y el transmisor con su ficha.', run: exportKmz },
  ]);
  const coverageLayer = createCoverageLayer(page.map, opacity);
  const legend = createMapLegend(page.legendRoot, {
    onView() {},
    onThresholds(next) {
      thresholds = next;
      redraw();
    },
    onOpacity(value) {
      opacity = value;
      coverageLayer.setOpacity(value);
    },
  });

  const site = createSiteControls(page, {
    radiusKm: fromLink?.radiusKm ?? SERVICE[service].radiusKm,
    maxRadiusKm: MAX_RADIUS_KM,
    initial: fromLink ?? undefined,
    onChange,
  });
  /** Lo que tienes en la página: lo mismo para el enlace y para lo guardado en el navegador. */
  const pageData = () =>
    broadcastShareData(
      { site: site.getSite(), name: site.getName(), radiusKm: site.getRadiusKm(), thresholds, fm, am, amAntennaId: amAntenna.id, groundId: ground.id },
      service,
    );

  if (draft.hasOwn) showSharedNotice(page.panel, opened ?? { ok: true, data: null }, undefined, { label: 'Volver a la tuya', run: draft.backToOwn });
  else showSharedNotice(page.panel, opened);
  if (draft.restarted) showPageNotice(page.panel, 'Empezaste una simulación nueva.', { label: 'Deshacer', run: draft.undoStartOver });
  page.find('[data-start-over]').addEventListener('click', draft.startOver);
  addShareControl(page.map, {
    title: () =>
      `Hertzo · ${service === 'fm' ? `FM ${formatMHz(fm.frequencyMHz)}` : `AM ${integerFormat.format(am.frequencyKHz)} kHz`}${site.getName() ? ` · ${site.getName()}` : ''}`,
    data: pageData,
  });
  const controller = createCoverageController(page.find('[data-coverage-status]'), page.find('[data-simulate-box]'), (result) => {
    coverage = result;
    geometry = buildRasterGeometry(result.plan);
    values = new Float32Array(geometry.index.length);
    lowConfidence = new Uint8Array(geometry.index.length);
    pixels = new Uint8ClampedArray(geometry.index.length * 4);
    exporter.setEnabled(true);
    redraw();
  });

  const frequencyMHz = () => (service === 'fm' ? fm.frequencyMHz : am.frequencyKHz / 1000);
  /** PIRE en dBm: FM a partir de la ERP; AM con la ganancia del monopolo sobre el suelo. */
  const eirpDbm = () =>
    service === 'fm' ? erpToEirpDbm(kilowattsToDbm(fm.erpKw)) : kilowattsToDbm(am.powerKw) + amAntenna.gainDbi;

  function buildStationForm() {
    stationForm.replaceChildren();
    fmReceiver.hidden = service !== 'fm';
    if (service === 'fm') {
      setInfo(
        serviceHint,
        'Banda de 88 a 108 MHz. La señal llega por línea de vista y difracción sobre el relieve: el motor es el ITM sobre terreno SRTM.',
      );
      createFieldGroup(stationForm, FM_FIELDS, fm, (next) => {
        fm = next;
        onChange();
      });
    } else {
      setInfo(
        serviceHint,
        'Onda media de 530 a 1710 kHz. De día la señal viaja pegada al suelo (onda de tierra): manda la conductividad del terreno, no el relieve. De noche la onda de cielo de emisoras lejanas en el mismo canal y en los adyacentes interfiere y la cobertura útil se encoge.',
      );
      createFieldGroup(stationForm, AM_FIELDS, am, (next) => {
        am = next;
        onChange();
      });
      stationForm.append(
        createSelectField('Antena', AM_ANTENNAS, amAntenna.id, (id) => {
          amAntenna = AM_ANTENNAS.find((a) => a.id === id)!;
          onChange();
        }).element,
        createSelectField('Suelo', GROUND_TYPES, ground.id, (id) => {
          ground = GROUND_TYPES.find((g) => g.id === id)!;
          onChange();
        }).element,
      );
    }
  }

  function request(): CoverageRequest | null {
    const location = site.getSite();
    if (!location) return null;
    if (service === 'fm') {
      const radiusM = Math.min(site.getRadiusKm(), FM_MAX_RADIUS_KM) * 1000;
      return {
        site: location,
        radiusM,
        engine: itmSpec(clutter, reliability),
        links: [{ siteHeightM: fm.antennaHeightM, radioHeightM: fm.receiverHeightM, frequencyMHz: fm.frequencyMHz }],
        // Hasta ~1700 muestras por radial: a 150 km el terreno va cada 88 m.
        plan: { stepM: Math.max(30, radiusM / 1700) },
      };
    }
    const radiusM = site.getRadiusKm() * 1000;
    return {
      site: location,
      radiusM,
      engine: { id: 'groundwave', ground },
      links: [{ siteHeightM: 1, radioHeightM: 1, frequencyMHz: am.frequencyKHz / 1000 }],
      // La onda de tierra no usa el relieve: 1000 puntos por radial y 1440 radiales bastan.
      plan: { stepM: radiusM / 1000, stride: 1, maxArcM: (2 * Math.PI * radiusM) / 1440 },
    };
  }

  function engineOf(result: CoverageResult): EngineSpec {
    return result.request.engine;
  }

  /** " · estéreo, urbano" para la franja i, solo si los umbrales siguen siendo los de la norma. */
  function zoneSuffix(i: number): string {
    const defaults: readonly number[] = SERVICE[service].thresholds;
    const sameAsDefault = [...thresholds].sort((a, b) => b - a).join() === defaults.join();
    return sameAsDefault ? ` · ${SERVICE[service].descriptions[i]}` : '';
  }

  function legendEntries() {
    return bandLabels(thresholds, 'dBµV/m').map((label, i) => ({ color: LEVEL_COLORS[i]!, label: label + zoneSuffix(i) }));
  }

  /** Zonas de servicio del último cálculo: umbral, alcance (solo AM) y área. La misma tabla va al KMZ. */
  function zoneTable(): { header: string[]; rows: string[][]; note: string } | null {
    if (!coverage || !values || !geometry) return null;
    const sorted = [...thresholds].sort((a, b) => b - a);
    const areas = areaAboveKm2(values, sorted, pixelAreaKm2(geometry, coverage.plan.radiusM));
    const isAm = coverage.request.engine.id === 'groundwave';
    const radiusKm = coverage.plan.radiusM / 1000;
    const rows = sorted.map((t, i) => {
      const label = `≥ ${t} dBµV/m (${mvmFormat.format(dbuvmToMvm(t))} mV/m)`;
      const area = `${integerFormat.format(areas[i]!)} km²`;
      if (!isAm) return [label, area];
      // Suelo y frecuencia del cálculo que muestra el mapa, aunque el formulario ya tenga otros.
      const shownEngine = coverage!.request.engine;
      const shownGround = shownEngine.id === 'groundwave' ? shownEngine.ground : ground;
      const range = groundwaveRangeKm(eirpDbm(), coverage!.request.links[0]!.frequencyMHz, shownGround, t);
      const rangeText = range >= radiusKm ? `> ${integerFormat.format(radiusKm)} km` : `${oneDecimal.format(range)} km`;
      return [label, rangeText, area];
    });
    return {
      header: ['', ...(isAm ? ['Alcance'] : []), 'Área'],
      rows,
      note: isAm
        ? AM_NIGHT_NOTE
        : [
            `Área dentro del radio de cálculo donde el campo supera cada umbral, con ${requestReliability(coverage.request)} % de confiabilidad.`,
            clutterSummary(coverage.request) ? `${clutterSummary(coverage.request)} (receptor y transmisor).` : 'Sin entorno: el relieve no trae edificios ni árboles.',
            'El rayado marca laderas empinadas junto al transmisor, donde el ITM advierte baja confianza.',
          ].join(' '),
    };
  }

  function showZones() {
    const table = zoneTable();
    if (!table) return;
    const body = table.rows.map(
      ([label, ...cells], i) =>
        `<tr><th scope="row"><span class="legend-swatch" style="background:${LEVEL_COLORS[i]}"></span>${label}</th>
        ${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`,
    );
    zones.innerHTML = `
      <table class="budget zones">
        <thead><tr>${table.header.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${body.join('')}</tbody>
      </table>
      <p class="hint">${table.note}</p>`;
  }

  /** Título y textos de la leyenda, iguales en el mapa y en el KMZ. */
  function legendTexts() {
    return {
      title: service === 'fm' ? 'Intensidad de campo FM (dBµV/m)' : 'AM: cobertura diurna (onda de tierra), dBµV/m',
      entries: legendEntries(),
      emptyLabel: 'por debajo del umbral más bajo',
      hatchLabel: service === 'fm' ? 'baja confianza (ladera empinada junto al transmisor)' : '',
    };
  }

  /** "FM 98,5 MHz" o "AM 1.000 kHz". */
  const stationLabel = () =>
    service === 'fm' ? `FM ${formatMHz(fm.frequencyMHz)}` : `AM ${integerFormat.format(am.frequencyKHz)} kHz`;

  /**
   * Descarga un KMZ con el campo y su leyenda, el transmisor con su ficha y las zonas de servicio,
   * y un contorno por umbral.
   */
  async function exportKmz() {
    const zoneInfo = zoneTable();
    if (!coverage || !zoneInfo) return;
    const result = coverage;
    const offsetDb = fieldStrengthDbuvm(eirpDbm(), result.request.links[0]!.frequencyMHz);
    const mask = lowConfidenceMask(engineOf(result));
    const levels = [...thresholds].sort((a, b) => b - a);
    const position = result.plan.site;
    const name = site.getName();
    const station =
      service === 'fm'
        ? [
            ['Frecuencia', formatMHz(result.request.links[0]!.frequencyMHz)],
            ['Potencia radiada (ERP)', `${mvmFormat.format(fm.erpKw)} kW (${oneDecimal.format(kilowattsToDbm(fm.erpKw))} dBm)`],
            ['PIRE', `${oneDecimal.format(eirpDbm())} dBm (${mvmFormat.format(fm.erpKw * 1.64)} kW)`],
            ['Altura de la antena', `${formatHeight(fm.antennaHeightM)} sobre el terreno`],
            ['Altura del receptor', formatHeight(fm.receiverHeightM)],
          ]
        : [
            ['Frecuencia', `${integerFormat.format(result.request.links[0]!.frequencyMHz * 1000)} kHz`],
            ['Potencia del transmisor', `${mvmFormat.format(am.powerKw)} kW (${oneDecimal.format(kilowattsToDbm(am.powerKw))} dBm)`],
            ['Antena', amAntenna.label],
            ['PIRE', `${oneDecimal.format(eirpDbm())} dBm`],
            ['Suelo', (result.request.engine.id === 'groundwave' ? result.request.engine.ground : ground).label],
          ];

    await downloadCoverageKmz({
      documentName: `Hertzo · Radiodifusión ${stationLabel()}${name ? ` · ${name}` : ''}`,
      fileName: exportFileName(
        'radiodifusion',
        service === 'fm' ? `FM-${fm.frequencyMHz}MHz` : `AM-${am.frequencyKHz}kHz`,
        position,
        'kmz',
        name,
      ),
      plan: result.plan,
      layers: [
        {
          name: `Campo ${stationLabel()}`,
          file: 'campo',
          paint(g, out) {
            const v = new Float32Array(g.index.length);
            const low = new Uint8Array(g.index.length);
            gridValues(g, result.grids[0]!, offsetDb, v);
            lowConfidencePixels(g, result.grids, mask, low);
            paintBands(g, v, levels, LEVEL_COLORS.slice(0, levels.length), low, out);
          },
          legend: legendTexts(),
        },
      ],
      opacity,
      lines: {
        folderName: 'Contornos',
        lines: levels.map((t, i) => ({
          name: `${t} dBµV/m (${mvmFormat.format(dbuvmToMvm(t))} mV/m)${zoneSuffix(i)}`,
          color: LEVEL_COLORS[i]!,
          points: contourRing(result.plan, result.grids[0]!, offsetDb, t),
        })),
      },
      site: {
        name: `${name || 'Transmisor'} · ${stationLabel()}`,
        position,
        tables: [
          {
            rows: [
              ['Ubicación (lat, lon)', formatLonLat(position.lon, position.lat)],
              ['Servicio', service === 'fm' ? 'FM (ITM sobre terreno)' : 'AM, cobertura diurna (onda de tierra)'],
              ...(service === 'fm'
                ? [
                    ['Confiabilidad', `${requestReliability(result.request)} %`],
                    ['Entorno del receptor', clutterSummary(result.request)?.replace(/^Entorno /, '') ?? 'Sin entorno (solo relieve)'],
                  ]
                : []),
              ...station,
              ['Radio de cálculo', `${integerFormat.format(result.plan.radiusM / 1000)} km`],
            ],
          },
          { title: 'Zonas de servicio', ...zoneInfo },
        ],
      },
    });
  }

  function redraw() {
    stationSummary.textContent =
      service === 'fm'
        ? `PIRE ${oneDecimal.format(eirpDbm())} dBm (${mvmFormat.format(fm.erpKw * 1.64)} kW PIRE).`
        : `Campo sin atenuación del suelo a 1 km: ${integerFormat.format(dbuvmToMvm(fieldFromEirp(eirpDbm(), freeSpaceLossDb(1, frequencyMHz()), frequencyMHz())))} mV/m. El mapa es la cobertura diurna (onda de tierra).`;
    if (!coverage || !geometry || !values || !lowConfidence || !pixels) return;
    const f = coverage.request.links[0]!.frequencyMHz;
    // Campo = PIRE − pérdida + 20·log f + 77,2 (ITU-R P.525).
    gridValues(geometry, coverage.grids[0]!, fieldStrengthDbuvm(eirpDbm(), f), values);
    lowConfidencePixels(geometry, coverage.grids, lowConfidenceMask(engineOf(coverage)), lowConfidence);
    paintBands(geometry, values, thresholds, LEVEL_COLORS.slice(0, thresholds.length), lowConfidence, pixels);
    coverageLayer.draw(geometry, pixels);
    legend.update({
      views: [{ id: 'campo', label: 'Campo' }],
      activeView: 'campo',
      ...legendTexts(),
      // En AM no hay rayado: la serie de residuos vale a cualquier distancia.
      ...(service === 'am' && { hatchLabel: undefined }),
      thresholds: { values: thresholds, unit: 'dBµV/m', ...THRESHOLD_RANGE },
      opacity,
    });
    showZones();
  }

  function onChange() {
    redraw();
    controller.setRequest(request());
  }

  bindChoice(page.panel, 'servicio', service, (id) => {
    service = id as Service;
    thresholds = [...SERVICE[service].thresholds];
    site.setRadiusKm(SERVICE[service].radiusKm);
    coverage = null;
    controller.forgetResult();
    exporter.setEnabled(false);
    coverageLayer.clear();
    legend.hide();
    zones.innerHTML = '<p class="hint">Calculando…</p>';
    buildStationForm();
    replaceQuery('servicio', service);
    onChange();
  });

  const readout = createHoverReadout(page.readoutRoot);
  page.map.on('mousemove', (event) => {
    if (!coverage) return readout.hide();
    const point = { lon: event.lngLat.lng, lat: event.lngLat.lat };
    const g = gridIndexAt(coverage.plan, point);
    if (g < 0) return readout.hide();
    const f = coverage.request.links[0]!.frequencyMHz;
    const field = fieldStrengthDbuvm(eirpDbm() - coverage.grids[0]!.lossDb[g]!, f);
    const lines = [
      `A ${oneDecimal.format(distanceM(coverage.plan.site, point) / 1000)} km del transmisor`,
      `Campo: ${oneDecimal.format(field)} dBµV/m (${mvmFormat.format(dbuvmToMvm(field))} mV/m)`,
    ];
    if (service === 'fm' && coverage.grids[0]!.warnings[g]! & lowConfidenceMask(engineOf(coverage))) {
      lines.push('Baja confianza: ladera empinada junto al transmisor');
    }
    readout.show(lines, event.point.x, event.point.y);
  });
  page.map.on('mouseout', () => readout.hide());

  buildStationForm();
  onChange();

  draft.start(root, pageData);

  return () => {
    draft.stop();
    controller.destroy();
    page.destroy();
  };
}
