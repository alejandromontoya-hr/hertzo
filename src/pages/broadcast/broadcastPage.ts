// Radiodifusión FM y AM: intensidad de campo y zonas de servicio de una emisora.
// FM se propaga por línea de vista y difracción sobre el relieve (ITM); AM viaja como onda
// de tierra y depende sobre todo de la conductividad del suelo (Sommerfeld-Norton).

import { LEVEL_COLORS } from '../../coverage/colorScale';
import type { CoverageRequest, CoverageResult } from '../../coverage/computeCoverage';
import { paintBands, bandLabels } from '../../coverage/paint';
import { areaAboveKm2, gridValues, lowConfidencePixels, pixelAreaKm2 } from '../../coverage/pixelValues';
import { buildRasterGeometry, gridIndexAt, type RasterGeometry } from '../../coverage/raster';
import { distanceM } from '../../geo/geodesy';
import { createCoverageLayer } from '../../map/coverageLayer';
import { lowConfidenceMask, type EngineSpec } from '../../propagation/engines';
import {
  dbuvmToMvm,
  erpToEirpDbm,
  fieldFromEirp,
  fieldStrengthDbuvm,
  freeSpaceLossDb,
  kilowattsToDbm,
} from '../../rf/fieldStrength';
import { AM_ANTENNAS, GROUND_TYPES, flatEarthLimitKm, groundwaveRangeKm } from '../../rf/groundwave';
import { createMapLegend } from '../../ui/coverageLegend';
import { createFieldGroup, createSelectField, type NumberFieldSpec } from '../../ui/fields';
import { createHoverReadout } from '../../ui/hoverReadout';
import type { PageContext } from '../router';
import { createCoverageController } from '../shared/coverageController';
import { bindSegmented, coverageStatusHtml, createMapPage, segmentedHtml, siteSectionHtml } from '../shared/mapPage';
import { createSiteControls } from '../shared/siteControls';

type Service = 'fm' | 'am';

interface FmStation {
  frequencyMHz: number;
  erpKw: number;
  antennaHeightM: number;
  receiverHeightM: number;
}

interface AmStation {
  frequencyKHz: number;
  powerKw: number;
}

const FM_FIELDS: readonly NumberFieldSpec<keyof FmStation>[] = [
  { key: 'frequencyMHz', label: 'Frecuencia', unit: 'MHz', min: 76, max: 108 },
  { key: 'erpKw', label: 'Potencia radiada (ERP)', unit: 'kW', min: 0, max: 500, minExclusive: true },
  { key: 'antennaHeightM', label: 'Altura de la antena', unit: 'm', min: 1, max: 1000 },
  {
    key: 'receiverHeightM',
    label: 'Altura del receptor',
    unit: 'm',
    min: 0.5,
    max: 100,
    hint: '10 m es la altura de referencia para planificar FM; 1,5 m para un radio portátil.',
  },
];

const AM_FIELDS: readonly NumberFieldSpec<keyof AmStation>[] = [
  { key: 'frequencyKHz', label: 'Frecuencia', unit: 'kHz', min: 530, max: 1710 },
  { key: 'powerKw', label: 'Potencia del transmisor', unit: 'kW', min: 0, max: 1000, minExclusive: true },
];

/** Umbrales de campo de la ITU-R BS.412 (FM) y valores habituales de servicio diurno en AM. */
const SERVICE = {
  fm: {
    thresholds: [74, 66, 54, 48],
    descriptions: ['estéreo, ciudades grandes', 'estéreo, urbano', 'estéreo, rural', 'mono, rural'],
    radiusKm: 60,
  },
  am: {
    thresholds: [74, 66, 54],
    descriptions: ['5 mV/m, zona urbana densa', '2 mV/m, urbano', '0,5 mV/m, rural'],
    radiusKm: 150,
  },
} as const;

/** FM: radio máximo del cálculo con ITM (más allá es lento y el horizonte ya cortó). */
const FM_MAX_RADIUS_KM = 150;

const mvmFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

export function mountBroadcastPage({ root, params }: PageContext): () => void {
  let service: Service = params.get('servicio') === 'am' ? 'am' : 'fm';
  let fm: FmStation = { frequencyMHz: 98.5, erpKw: 10, antennaHeightM: 40, receiverHeightM: 10 };
  let am: AmStation = { frequencyKHz: 1000, powerKw: 10 };
  let amAntenna = AM_ANTENNAS[1]!;
  let ground = GROUND_TYPES.find((g) => g.id === 'media')!;
  let thresholds: number[] = [...SERVICE[service].thresholds];
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
      ${segmentedHtml('servicio', [{ id: 'fm', label: 'FM' }, { id: 'am', label: 'AM' }], 'Servicio')}
      <p class="hint" data-service-hint></p>
    </section>
    ${siteSectionHtml('Transmisor', 'Haz clic en el mapa para ubicar la antena de la emisora.')}
    ${coverageStatusHtml()}
    <section class="panel-section">
      <h2>Emisora</h2>
      <div class="form" data-station-form></div>
      <p class="hint" data-station-summary></p>
    </section>
    <section class="panel-section">
      <h2>Zonas de servicio</h2>
      <div data-zones><p class="hint">Ubica el transmisor para ver el alcance de cada zona.</p></div>
    </section>`,
    'Parámetros de la emisora',
  );

  const serviceHint = page.find('[data-service-hint]');
  const stationForm = page.find('[data-station-form]');
  const stationSummary = page.find('[data-station-summary]');
  const zones = page.find('[data-zones]');
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

  const site = createSiteControls(page, { radiusKm: SERVICE[service].radiusKm, maxRadiusKm: 300, onChange });
  const controller = createCoverageController(page.find('[data-coverage-status]'), (result) => {
    coverage = result;
    geometry = buildRasterGeometry(result.plan);
    values = new Float32Array(geometry.index.length);
    lowConfidence = new Uint8Array(geometry.index.length);
    pixels = new Uint8ClampedArray(geometry.index.length * 4);
    redraw();
  });

  const frequencyMHz = () => (service === 'fm' ? fm.frequencyMHz : am.frequencyKHz / 1000);
  /** PIRE en dBm: FM a partir de la ERP; AM con la ganancia del monopolo sobre el suelo. */
  const eirpDbm = () =>
    service === 'fm' ? erpToEirpDbm(kilowattsToDbm(fm.erpKw)) : kilowattsToDbm(am.powerKw) + amAntenna.gainDbi;

  function buildStationForm() {
    stationForm.replaceChildren();
    if (service === 'fm') {
      serviceHint.textContent =
        'Banda de 88 a 108 MHz. La señal llega por línea de vista y difracción sobre el relieve: el motor es el ITM sobre terreno SRTM.';
      createFieldGroup(stationForm, FM_FIELDS, fm, (next) => {
        fm = next;
        onChange();
      });
    } else {
      serviceHint.textContent =
        'Onda media de 530 a 1710 kHz. La señal viaja pegada al suelo (onda de tierra): manda la conductividad del terreno, no el relieve.';
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
        engine: { id: 'itm' },
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

  function legendEntries() {
    const labels = bandLabels(thresholds, 'dBµV/m');
    const defaults: readonly number[] = SERVICE[service].thresholds;
    const sameAsDefault = [...thresholds].sort((a, b) => b - a).join() === defaults.join();
    return labels.map((label, i) => ({
      color: LEVEL_COLORS[i]!,
      label: sameAsDefault ? `${label} · ${SERVICE[service].descriptions[i]}` : label,
    }));
  }

  function showZones() {
    if (!coverage || !values || !geometry) return;
    const sorted = [...thresholds].sort((a, b) => b - a);
    const areas = areaAboveKm2(values, sorted, pixelAreaKm2(geometry, coverage.plan.radiusM));
    const isAm = coverage.request.engine.id === 'groundwave';
    const rows = sorted.map((t, i) => {
      const range = isAm ? groundwaveRangeKm(eirpDbm(), frequencyMHz(), ground, t) : null;
      const rangeText = range === null ? '' : range >= coverage!.plan.radiusM / 1000 ? `> ${integerFormat.format(coverage!.plan.radiusM / 1000)} km` : `${oneDecimal.format(range)} km`;
      return `<tr><th scope="row"><span class="legend-swatch" style="background:${LEVEL_COLORS[i]}"></span>≥ ${t} dBµV/m (${mvmFormat.format(dbuvmToMvm(t))} mV/m)</th>
        ${isAm ? `<td>${rangeText}</td>` : ''}<td>${integerFormat.format(areas[i]!)} km²</td></tr>`;
    });
    zones.innerHTML = `
      <table class="budget zones">
        <thead><tr><th></th>${isAm ? '<th>Alcance</th>' : ''}<th>Área</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <p class="hint">${
        isAm
          ? `El modelo de Tierra plana vale hasta ~${integerFormat.format(flatEarthLimitKm(frequencyMHz()))} km a esta frecuencia; más allá aparece rayado porque la predicción es optimista.`
          : 'Área dentro del radio de cálculo donde el campo supera cada umbral. El rayado marca laderas empinadas junto al transmisor, donde el ITM advierte baja confianza.'
      }</p>`;
  }

  function redraw() {
    stationSummary.textContent =
      service === 'fm'
        ? `PIRE ${oneDecimal.format(eirpDbm())} dBm (${mvmFormat.format(fm.erpKw * 1.64)} kW PIRE).`
        : `Campo sin atenuación del suelo a 1 km: ${integerFormat.format(dbuvmToMvm(fieldFromEirp(eirpDbm(), freeSpaceLossDb(1, frequencyMHz()), frequencyMHz())))} mV/m.`;
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
      title: service === 'fm' ? 'Intensidad de campo FM (dBµV/m)' : 'Intensidad de campo AM, onda de tierra (dBµV/m)',
      entries: legendEntries(),
      emptyLabel: 'por debajo del umbral más bajo',
      hatchLabel: service === 'fm' ? 'baja confianza (ladera empinada junto al transmisor)' : 'más allá de la validez de Tierra plana',
      thresholds: { values: thresholds, unit: 'dBµV/m', min: 0, max: 140 },
      opacity,
    });
    showZones();
  }

  function onChange() {
    redraw();
    controller.schedule(request());
  }

  bindSegmented(page.panel, 'servicio', service, (id) => {
    service = id as Service;
    thresholds = [...SERVICE[service].thresholds];
    site.setRadiusKm(SERVICE[service].radiusKm);
    coverage = null;
    coverageLayer.clear();
    legend.hide();
    zones.innerHTML = '<p class="hint">Calculando…</p>';
    buildStationForm();
    history.replaceState(null, '', `#/radiodifusion?servicio=${service}`);
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
    if (coverage.grids[0]!.warnings[g]! & lowConfidenceMask(engineOf(coverage))) {
      lines.push(service === 'fm' ? 'Baja confianza: ladera empinada junto al transmisor' : 'Más allá de la validez de Tierra plana: optimista');
    }
    readout.show(lines, event.point.x, event.point.y);
  });
  page.map.on('mouseout', () => readout.hide());

  buildStationForm();
  onChange();

  return () => {
    controller.destroy();
    page.destroy();
  };
}
