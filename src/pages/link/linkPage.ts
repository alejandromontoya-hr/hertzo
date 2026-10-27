// Enlaces punto a punto: microondas y radioenlaces VHF/UHF. Perfil con la curvatura de la
// Tierra, despeje de la zona de Fresnel, pérdidas, nivel recibido, margen y disponibilidad.

import { Marker, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { saveFile } from '../../export/download';
import { exportFileName, linkKml, type KmlPlacemark } from '../../export/kml';
import { linkRayPath } from '../../export/linkPath';
import { drawProfileReport } from '../../export/profileImage';
import { reportDate, type ReportRow } from '../../export/reportImage';
import { zipStore } from '../../export/zip';
import { destinationPoint, distanceM, initialBearingDeg, type LonLat } from '../../geo/geodesy';
import { addExportControl } from '../../map/exportControl';
import { loadItm } from '../../propagation/itm';
import { freeSpaceLossDb } from '../../rf/fieldStrength';
import {
  CLIMATE_FACTORS,
  clearanceProfile,
  deygoutLoss,
  elevationAngleDeg,
  gaseousAttenuationDbPerKm,
  minClearance,
  multipathOutageProbability,
  parabolicGainDbi,
  type ClearancePoint,
} from '../../rf/pointToPoint';
import { dbmToWatts } from '../../rf/units';
import { loadTerrain } from '../../terrain/elevation';
import { profileBounds, sampleProfile, type TerrainProfile } from '../../terrain/profile';
import { createFieldGroup, createSelectField, type NumberFieldSpec } from '../../ui/fields';
import { formatHeight, formatLonLat, formatMeters, formatWatts } from '../../ui/format';
import { createLinkChart } from '../../ui/linkChart';
import { replaceQuery, type PageContext } from '../router';
import { bindSegmented, createMapPage, segmentedHtml } from '../shared/mapPage';

type LinkType = 'microondas' | 'radio';

interface LinkParams {
  frequencyMHz: number;
  txPowerDbm: number;
  heightAM: number;
  heightBM: number;
  /** Microondas: diámetro de cada parábola (m). Radio: ganancia de cada antena (dBi). */
  antennaA: number;
  antennaB: number;
  lossAdb: number;
  lossBdb: number;
  thresholdDbm: number;
}

const PRESETS: Record<LinkType, { params: LinkParams; frequencies: { id: string; label: string }[] }> = {
  microondas: {
    params: { frequencyMHz: 11000, txPowerDbm: 20, heightAM: 30, heightBM: 30, antennaA: 0.6, antennaB: 0.6, lossAdb: 1, lossBdb: 1, thresholdDbm: -70 },
    frequencies: [6175, 7400, 8000, 11000, 13000, 15000, 18000, 23000].map((f) => ({ id: String(f), label: `${f / 1000} GHz` })),
  },
  radio: {
    params: { frequencyMHz: 450, txPowerDbm: 40, heightAM: 20, heightBM: 20, antennaA: 10, antennaB: 10, lossAdb: 2, lossBdb: 2, thresholdDbm: -110 },
    frequencies: [150, 450, 900].map((f) => ({ id: String(f), label: `${f} MHz` })),
  },
};

const K_FACTORS = [
  { id: '1.3333', label: 'k = 4/3 (atmósfera estándar)' },
  { id: '1', label: 'k = 1 (sin refracción)' },
  { id: '0.6667', label: 'k = 2/3 (desfavorable, para el peor caso)' },
];

type LossModel = 'difraccion' | 'itm';

/** Ejemplo inicial: del cerro del Padre Amaya al cerro El Volador (Medellín). */
const EXAMPLE_A: LonLat = { lon: -75.6853, lat: 6.2794 };
const EXAMPLE_B: LonLat = { lon: -75.5828, lat: 6.2664 };

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

const SECONDS_PER_YEAR = 365.25 * 24 * 3600;

/** «11 GHz» o «450 MHz». */
const frequencyLabel = (mhz: number) => (mhz >= 1000 ? `${mhz / 1000} GHz` : `${mhz} MHz`);

/** Lo que muestra el panel tras un cálculo, guardado tal cual para exportarlo. */
interface LinkResult {
  profile: TerrainProfile;
  points: ClearancePoint[];
  type: LinkType;
  params: LinkParams;
  kFactor: number;
  /** Veredicto del despeje: color de la línea en el mapa, palabra y explicación. */
  verdict: { color: string; label: string; text: string };
  /** Filas de la tabla de resultados; la primera es el veredicto. */
  rows: ReportRow[];
  note: string;
  gainA: number;
  gainB: number;
  azAB: number;
  azBA: number;
  tiltA: number;
  tiltB: number;
}

export function mountLinkPage({ root, params }: PageContext): () => void {
  let type: LinkType = params.get('tipo') === 'radio' ? 'radio' : 'microondas';
  let link: LinkParams = { ...PRESETS[type].params };
  let kFactor = 4 / 3;
  let climate = CLIMATE_FACTORS[1]!;
  let lossModel: LossModel = type === 'radio' ? 'itm' : 'difraccion';
  let endA: LonLat | null = EXAMPLE_A;
  let endB: LonLat | null = EXAMPLE_B;
  let profile: TerrainProfile | null = null;
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: LinkResult | null = null;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Enlace punto a punto</h2>
      ${segmentedHtml('tipo', [{ id: 'microondas', label: 'Microondas' }, { id: 'radio', label: 'Radioenlace VHF/UHF' }], 'Tipo de enlace')}
      <p class="hint">Haz clic en el mapa para mover el extremo más cercano, o arrastra los marcadores A y B.</p>
      <dl class="site-details" data-ends></dl>
    </section>
    <section class="panel-section">
      <h2>Resultado</h2>
      <div data-results><p class="hint">Calculando…</p></div>
    </section>
    <details class="panel-section" open>
      <summary>Equipos y antenas</summary>
      <div class="form" data-link-form></div>
    </details>
    <details class="panel-section">
      <summary>Propagación</summary>
      <div class="form" data-propagation-form></div>
    </details>`,
    'Parámetros del enlace',
  );
  page.profileRoot.classList.add('link-chart');
  page.map.jumpTo({ center: [-75.633, 6.272], zoom: 11.2 });

  const endsBox = page.find('[data-ends]');
  const results = page.find('[data-results]');
  const exporter = addExportControl(page.map, [
    { label: 'KMZ para Google Earth', description: 'Los extremos A y B con su ficha y el rayo en 3D con su cortina.', run: exportKmz },
    { label: 'Perfil en imagen (PNG)', description: 'Perfil, extremos y tabla de resultados, para informes.', run: exportProfile },
  ]);
  const linkForm = page.find('[data-link-form]');
  const propagationForm = page.find('[data-propagation-form]');

  // --- Marcadores y línea en el mapa ---

  const makeMarker = (color: string, label: string, at: LonLat) => {
    const element = document.createElement('div');
    element.className = 'end-marker';
    element.style.background = color;
    element.textContent = label;
    const marker = new Marker({ element, draggable: true }).setLngLat([at.lon, at.lat]).addTo(page.map);
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat();
      if (label === 'A') endA = { lon: lng, lat };
      else endB = { lon: lng, lat };
      schedule();
    });
    return marker;
  };
  const markerA = makeMarker('#0969da', 'A', EXAMPLE_A);
  const markerB = makeMarker('#bc4c00', 'B', EXAMPLE_B);

  const LINE = 'enlace-linea';
  const HOVER = 'enlace-cursor';
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
  const ensureLayers = () => {
    if (page.map.getSource(LINE)) return;
    page.map.addSource(LINE, { type: 'geojson', data: empty });
    page.map.addSource(HOVER, { type: 'geojson', data: empty });
    page.map.addLayer({ id: LINE, type: 'line', source: LINE, paint: { 'line-color': ['get', 'color'], 'line-width': 3 } });
    page.map.addLayer({
      id: HOVER,
      type: 'circle',
      source: HOVER,
      paint: { 'circle-radius': 6, 'circle-color': '#cf222e', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    });
  };
  const setLine = (color: string) => {
    if (!endA || !endB || !page.map.isStyleLoaded()) return;
    ensureLayers();
    page.map.getSource<GeoJSONSource>(LINE)!.setData({
      type: 'Feature',
      properties: { color },
      geometry: { type: 'LineString', coordinates: [[endA.lon, endA.lat], [endB.lon, endB.lat]] },
    });
  };

  page.map.on('click', (event) => {
    const point = { lon: event.lngLat.lng, lat: event.lngLat.lat };
    // Se mueve el extremo más cercano al clic.
    const moveA = !endA || (endB !== null && distanceM(point, endA) < distanceM(point, endB));
    if (moveA) {
      endA = point;
      markerA.setLngLat([point.lon, point.lat]);
    } else {
      endB = point;
      markerB.setLngLat([point.lon, point.lat]);
    }
    schedule();
  });

  const chart = createLinkChart(page.profileRoot, (d) => {
    if (!page.map.getSource(HOVER) || !endA || !endB) return;
    page.map.getSource<GeoJSONSource>(HOVER)!.setData(
      d === null
        ? empty
        : (() => {
            const p = destinationPoint(endA, initialBearingDeg(endA, endB), d);
            return { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } } as const;
          })(),
    );
  });

  // --- Formularios ---

  function buildForms() {
    linkForm.replaceChildren();
    propagationForm.replaceChildren();
    const isMicro = type === 'microondas';
    linkForm.append(
      createSelectField('Frecuencia', PRESETS[type].frequencies, String(link.frequencyMHz), (id) => {
        link = { ...link, frequencyMHz: Number(id) };
        schedule();
      }).element,
    );
    const antennaSpec = (key: 'antennaA' | 'antennaB', end: string): NumberFieldSpec<keyof LinkParams> =>
      isMicro
        ? { key, label: `Diámetro de la parábola en ${end}`, unit: 'm', min: 0.1, max: 5 }
        : { key, label: `Ganancia de la antena en ${end}`, unit: 'dBi', min: -5, max: 30 };
    const fields: NumberFieldSpec<keyof LinkParams>[] = [
      { key: 'txPowerDbm', label: 'Potencia del transmisor', unit: 'dBm', min: -10, max: 60 },
      { key: 'heightAM', label: 'Altura de la antena en A', unit: 'm', min: 1, max: 300 },
      { key: 'heightBM', label: 'Altura de la antena en B', unit: 'm', min: 1, max: 300 },
      antennaSpec('antennaA', 'A'),
      antennaSpec('antennaB', 'B'),
      { key: 'lossAdb', label: 'Pérdidas de línea y conectores en A', unit: 'dB', min: 0, max: 20 },
      { key: 'lossBdb', label: 'Pérdidas de línea y conectores en B', unit: 'dB', min: 0, max: 20 },
      { key: 'thresholdDbm', label: 'Umbral del receptor', unit: 'dBm', min: -140, max: -20 },
    ];
    createFieldGroup(linkForm, fields, link, (next) => {
      link = next;
      schedule();
    });
    propagationForm.append(
      createSelectField('Factor k de la Tierra', K_FACTORS, String(Number(kFactor.toFixed(4))), (id) => {
        kFactor = Number(id);
        schedule();
      }).element,
      createSelectField(
        'Pérdida para el balance',
        [
          { id: 'difraccion', label: 'Espacio libre + difracción (Deygout) + gases' },
          { id: 'itm', label: 'ITM (Longley-Rice), hasta 20 GHz' },
        ],
        lossModel,
        (id) => {
          lossModel = id as LossModel;
          schedule();
        },
      ).element,
      createSelectField('Terreno y clima (disponibilidad)', CLIMATE_FACTORS, climate.id, (id) => {
        climate = CLIMATE_FACTORS.find((c) => c.id === id)!;
        schedule();
      }).element,
    );
  }

  function antennaGainDbi(value: number): number {
    return type === 'microondas' ? parabolicGainDbi(value, link.frequencyMHz) : value;
  }

  // --- Cálculo ---

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => void compute(), 150);
  }

  /** Sin un resultado vigente no hay nada que exportar. */
  function forgetResult() {
    last = null;
    exporter.setEnabled(false);
  }

  async function compute() {
    if (!endA || !endB) return;
    const a = endA;
    const b = endB;
    const current = ++request;
    if (distanceM(a, b) < 50) {
      forgetResult();
      chart.showMessage('Los extremos están a menos de 50 m.');
      return;
    }
    try {
      if (!profile || profile.from !== a || profile.to !== b) {
        chart.showMessage('Descargando terreno…');
        const sampler = await loadTerrain(profileBounds(a, b));
        if (current !== request) return;
        profile = sampleProfile(sampler, a, b, 30);
      }
      await showResults(profile, current);
    } catch (error) {
      console.error(error);
      if (current !== request) return;
      forgetResult();
      chart.showMessage('No se pudo descargar el terreno.');
    }
  }

  async function showResults(p: TerrainProfile, current: number) {
    const geometry = {
      profile: { distancesM: p.distancesM, elevationsM: p.elevationsM },
      heightAM: link.heightAM,
      heightBM: link.heightBM,
      frequencyMHz: link.frequencyMHz,
      kFactor,
    };
    const points = clearanceProfile(geometry);
    const clearance = minClearance(points);
    const diffraction = deygoutLoss(geometry);
    const dKm = p.distanceM / 1000;
    const fspl = freeSpaceLossDb(dKm, link.frequencyMHz);
    const gases = gaseousAttenuationDbPerKm(link.frequencyMHz) * dKm;
    const modelLoss = fspl + diffraction.lossDb + gases;

    let itmLoss: number | null = null;
    if (link.frequencyMHz <= 20000) {
      const itm = await loadItm();
      if (current !== request) return;
      try {
        itmLoss = itm.pointToPoint([p.elevationsM.length - 1, p.stepM, ...p.elevationsM], link.heightAM, link.heightBM, link.frequencyMHz).lossDb;
      } catch {
        itmLoss = null;
      }
    }
    if (current !== request) return;

    const useItm = lossModel === 'itm' && itmLoss !== null;
    const pathLoss = useItm ? itmLoss! + gases : modelLoss;
    const gainA = antennaGainDbi(link.antennaA);
    const gainB = antennaGainDbi(link.antennaB);
    const eirp = link.txPowerDbm - link.lossAdb + gainA;
    const received = eirp - pathLoss + gainB - link.lossBdb;
    const margin = received - link.thresholdDbm;
    const outage = multipathOutageProbability(link.frequencyMHz, dKm, Math.max(0, margin), climate.c);

    const verdict =
      clearance.ratio >= 0.6
        ? { color: '#1a7f37', label: 'Despejado', text: 'La línea libra el 60 % de la primera zona de Fresnel.' }
        : clearance.ratio >= 0
          ? { color: '#bf8700', label: 'Despeje parcial', text: 'Hay línea de vista, pero el terreno invade la zona de Fresnel.' }
          : { color: '#cf222e', label: 'Obstruido', text: 'El terreno corta la línea entre antenas.' };
    setLine(verdict.color);

    const elevA = p.elevationsM[0]!;
    const elevB = p.elevationsM[p.elevationsM.length - 1]!;
    const azAB = initialBearingDeg(p.from, p.to);
    const azBA = initialBearingDeg(p.to, p.from);
    endsBox.innerHTML = `
      <dt>A</dt><dd>${formatLonLat(p.from.lon, p.from.lat)} · ${formatMeters(elevA)}</dd>
      <dt>B</dt><dd>${formatLonLat(p.to.lon, p.to.lat)} · ${formatMeters(elevB)}</dd>`;

    const signed = (v: number) => `${v >= 0 ? '+' : ''}${oneDecimal.format(v)}`;
    const tiltA = elevationAngleDeg(elevA + link.heightAM, elevB + link.heightBM, p.distanceM, kFactor);
    const tiltB = elevationAngleDeg(elevB + link.heightBM, elevA + link.heightAM, p.distanceM, kFactor);
    const rows: ReportRow[] = [
      ['Veredicto', verdict.label, true, verdict.color],
      ['Distancia', `${twoDecimals.format(dKm)} km`, false],
      ['Azimut A → B / B → A', `${oneDecimal.format(azAB)}° / ${oneDecimal.format(azBA)}°`, false],
      ['Inclinación en A / en B', `${twoDecimals.format(tiltA)}° / ${twoDecimals.format(tiltB)}°`, false],
      ['Despeje mínimo', `${integerFormat.format(clearance.ratio * 100)} % de F1 a ${twoDecimals.format(clearance.distanceM / 1000)} km`, true],
      ['Pérdida en espacio libre', `${oneDecimal.format(fspl)} dB`, false],
      [`Difracción (${diffraction.edges.length} arista${diffraction.edges.length === 1 ? '' : 's'})`, `${oneDecimal.format(diffraction.lossDb)} dB`, false],
      ['Gases atmosféricos', `${oneDecimal.format(gases)} dB`, false],
      ['ITM (comparación)', itmLoss === null ? 'no aplica sobre 20 GHz' : `${oneDecimal.format(itmLoss)} dB`, false],
      ['Pérdida usada en el balance', `${oneDecimal.format(pathLoss)} dB`, true],
      ['Ganancia de antena A / B', `${oneDecimal.format(gainA)} / ${oneDecimal.format(gainB)} dBi`, false],
      ['PIRE', `${oneDecimal.format(eirp)} dBm`, false],
      ['Nivel recibido', `${oneDecimal.format(received)} dBm`, true],
      ['Margen de desvanecimiento', `${signed(margin)} dB`, true],
      ['Disponibilidad (multitrayecto)', margin > 0 ? `${percentFormat.format(100 * (1 - outage))} %` : '—', false],
      ['Corte esperado al año', margin > 0 ? `${integerFormat.format((outage * SECONDS_PER_YEAR) / 60)} min` : 'sin margen', false],
    ];
    const note =
      link.frequencyMHz > 10000
        ? 'Sobre 10 GHz la lluvia es la causa principal de cortes y este cálculo no la incluye: deja margen adicional.'
        : 'La disponibilidad es la de Vigants-Barnett por desvanecimiento multitrayecto; no incluye lluvia ni fallas de equipo.';
    results.innerHTML = `
      <table class="budget">
        <tbody>
          ${rows
            .map(
              ([label, value, strong, dot]) =>
                `<tr${strong ? ' class="strong"' : ''}><th scope="row">${label}</th><td>${dot ? `<span class="status-dot" style="background:${dot}"></span>` : ''}${value}</td></tr>`,
            )
            .join('')}
        </tbody>
      </table>
      <p class="notice">${verdict.text}</p>
      <p class="hint">${note}</p>`;
    last = { profile: p, points, type, params: { ...link }, kFactor, verdict, rows, note, gainA, gainB, azAB, azBA, tiltA, tiltB };
    exporter.setEnabled(true);

    chart.show(points, `Perfil del enlace · ${twoDecimals.format(dKm)} km · ${frequencyLabel(link.frequencyMHz)}`);
  }

  /** Descarga una imagen PNG con el perfil, los extremos, el veredicto y la tabla de resultados. */
  async function exportProfile() {
    if (!last) return;
    const r = last;
    const { profile: p, params } = r;
    const frequency = frequencyLabel(params.frequencyMHz);
    const endLine = (label: 'A' | 'B', at: LonLat, elevation: number, height: number) =>
      `${label}: ${formatLonLat(at.lon, at.lat)} · cota ${formatMeters(elevation)} · antena a ${formatHeight(height)}`;
    const kLabel = K_FACTORS.find((k) => Number(k.id) === Number(r.kFactor.toFixed(4)))?.label ?? `k = ${r.kFactor}`;
    const png = await drawProfileReport({
      title: `Perfil del enlace · ${twoDecimals.format(p.distanceM / 1000)} km · ${frequency}`,
      subtitle: [
        endLine('A', p.from, p.elevationsM[0]!, params.heightAM),
        endLine('B', p.to, p.elevationsM[p.elevationsM.length - 1]!, params.heightBM),
        `Curvatura: ${kLabel} · ${reportDate()}`,
      ],
      points: r.points,
      rows: r.rows,
      notice: r.verdict.text,
      note: r.note,
    });
    saveFile(png, exportFileName('enlace-perfil', frequency, p.from, 'png'), 'image/png');
  }

  /**
   * Descarga un KMZ con los extremos A y B, cada uno con su ficha, y el rayo entre antenas con
   * una cortina hasta el suelo, del color del veredicto y con la tabla de resultados.
   */
  async function exportKmz() {
    if (!last) return;
    const r = last;
    const { profile: p, params } = r;
    const elevations = [p.elevationsM[0]!, p.elevationsM[p.elevationsM.length - 1]!];
    const antennaText = (value: number, gain: number) =>
      r.type === 'microondas'
        ? `Parábola de ${twoDecimals.format(value)} m (${oneDecimal.format(gain)} dBi)`
        : `${oneDecimal.format(gain)} dBi`;
    const end = (label: 'A' | 'B'): KmlPlacemark => {
      const isA = label === 'A';
      const other = isA ? 'B' : 'A';
      return {
        name: `Extremo ${label}`,
        position: isA ? p.from : p.to,
        tables: [
          {
            rows: [
              ['Ubicación (lat, lon)', formatLonLat((isA ? p.from : p.to).lon, (isA ? p.from : p.to).lat)],
              ['Cota del terreno', formatMeters(elevations[isA ? 0 : 1]!)],
              ['Altura de la antena', formatHeight(isA ? params.heightAM : params.heightBM)],
              ['Antena', antennaText(isA ? params.antennaA : params.antennaB, isA ? r.gainA : r.gainB)],
              ['Pérdidas de línea y conectores', `${oneDecimal.format(isA ? params.lossAdb : params.lossBdb)} dB`],
              [`Azimut hacia ${other}`, `${oneDecimal.format(isA ? r.azAB : r.azBA)}°`],
              [`Inclinación hacia ${other}`, `${twoDecimals.format(isA ? r.tiltA : r.tiltB)}°`],
              isA
                ? ['Potencia del transmisor', `${oneDecimal.format(params.txPowerDbm)} dBm (${formatWatts(dbmToWatts(params.txPowerDbm))})`]
                : ['Umbral del receptor', `${oneDecimal.format(params.thresholdDbm)} dBm`],
            ],
          },
        ],
      };
    };
    const frequency = frequencyLabel(params.frequencyMHz);
    const kml = linkKml(`Hertzo · Enlace ${frequency}`, [end('A'), end('B')], {
      name: `Enlace A–B · ${twoDecimals.format(p.distanceM / 1000)} km · ${frequency}`,
      color: r.verdict.color,
      points: linkRayPath(p, r.points),
      tables: [
        {
          rows: [
            ...r.rows.map(([label, value]) => [label, value]),
            ['Curvatura del rayo', K_FACTORS.find((k) => Number(k.id) === Number(r.kFactor.toFixed(4)))?.label ?? `k = ${r.kFactor}`],
          ],
          note: `${r.verdict.text} ${r.note}`,
        },
      ],
    });
    saveFile(
      zipStore([{ name: 'doc.kml', data: new TextEncoder().encode(kml) }]),
      exportFileName('enlace', frequency, p.from, 'kmz'),
      'application/vnd.google-earth.kmz',
    );
  }

  bindSegmented(page.panel, 'tipo', type, (id) => {
    type = id as LinkType;
    link = { ...PRESETS[type].params };
    lossModel = type === 'radio' ? 'itm' : 'difraccion';
    buildForms();
    replaceQuery('tipo', type);
    schedule();
  });

  buildForms();
  page.map.once('load', () => schedule());
  schedule();

  return () => {
    clearTimeout(timer);
    request++;
    page.destroy();
  };
}
