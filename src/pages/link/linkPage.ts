// Enlaces punto a punto: microondas y radioenlaces VHF/UHF. Perfil con la curvatura de la
// Tierra, despeje de la zona de Fresnel, pérdidas, nivel recibido, margen y disponibilidad
// (lluvia según la ITU-R P.530-18 y multitrayecto según Vigants-Barnett).

import { Marker, type GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { saveFile } from '../../export/download';
import { exportFileName, linkKml, type KmlPlacemark } from '../../export/kml';
import { SHARE_NOTICE_HTML, showPageNotice, showSharedNotice } from '../../export/shareButton';
import { SHARE_BROKEN_MESSAGE } from '../../export/shareLink';
import { linkRayPath } from '../../export/linkPath';
import { drawProfileReport } from '../../export/profileImage';
import { reportDate, type ReportRow } from '../../export/reportImage';
import { zipStore } from '../../export/zip';
import { destinationPoint, distanceM, initialBearingDeg, type LonLat } from '../../geo/geodesy';
import { addExportControl } from '../../map/exportControl';
import { addShareControl } from '../../map/shareControl';
import { START_OVER_HTML, openDraft } from '../shared/draft';
import { createPickBanner } from '../../map/pickBanner';
import { DEFAULT_ITM_PARAMETERS, loadItm, type ItmParameters } from '../../propagation/itm';
import { freeSpaceLossDb } from '../../rf/fieldStrength';
import {
  CLIMATE_FACTORS,
  TERRAIN_FACTORS,
  clearanceCriteria,
  clearanceProfile,
  deygoutLoss,
  elevationAngleDeg,
  gaseousAttenuationDbPerKm,
  minClearance,
  multipathOutageProbability,
  parabolicGainDbi,
  type ClearancePoint,
} from '../../rf/pointToPoint';
import {
  DEFAULT_RAIN_RATE_MM_H,
  rainAttenuation001Db,
  rainOutagePercent,
  type Polarization,
  type RainOutage,
} from '../../rf/rain';
import { dbmToWatts } from '../../rf/units';
import { loadTerrain } from '../../terrain/elevation';
import { profileBounds, sampleProfile, type TerrainProfile } from '../../terrain/profile';
import { createFieldGroup, createNumberField, createSelectField } from '../../ui/fields';
import { infoButton } from '../../ui/infoTip';
import { bindSiteFields, siteFieldsHtml } from '../../ui/siteFields';
import { formatHeight, formatLonLat, formatMeters, formatWatts } from '../../ui/format';
import { createLinkChart } from '../../ui/linkChart';
import { DISH_ICON } from '../../ui/icons';
import { replaceQuery, type PageContext } from '../router';
import { bindChoice, choiceHtml, createMapPage, simulateBoxHtml } from '../shared/mapPage';
import {
  DEFAULT_CLIMATE_ID,
  DEFAULT_K_FACTOR,
  DEFAULT_POLARIZATION,
  DEFAULT_TERRAIN_ID,
  EXAMPLE_A,
  EXAMPLE_B,
  EXAMPLE_NAME_A,
  EXAMPLE_NAME_B,
  K_FACTORS,
  POLARIZATIONS,
  PRESETS,
  RAIN_FIELD,
  defaultLossModel,
  kFactorId,
  linkFieldSpecs,
  type LinkParams,
  type LinkType,
  type LossModel,
} from './linkFields';
import { linkShareData, readLinkShare } from './linkShare';

/**
 * ITM para un enlace fijo: modo de variabilidad 1 (accidental), el de los trayectos punto a punto
 * entre antenas fijas, en vez del 2 (móvil) de las coberturas. Al 50 % la mediana es la misma.
 */
const LINK_ITM_PARAMETERS: ItmParameters = { ...DEFAULT_ITM_PARAMETERS, variabilityMode: 1 };

type EndLabel = 'A' | 'B';
const END_COLORS: Record<EndLabel, string> = { A: '#0969da', B: '#bc4c00' };

/** Mismo punto, aunque sean objetos distintos (por ejemplo, escrito de nuevo en los campos). */
const samePoint = (p: LonLat, q: LonLat) => p.lon === q.lon && p.lat === q.lat;

/** Bloque de un extremo: título con su color, nombre, coordenadas y "Elegir en el mapa". */
const endHtml = (label: EndLabel, name: string) => `
  <h3 class="end-title"><span class="end-badge" style="background:${END_COLORS[label]}">${label}</span>Extremo ${label}</h3>
  ${siteFieldsHtml(`end-${label.toLowerCase()}`, name, `el extremo ${label}`)}
  <dl class="site-details" data-end-elevation="${label}" hidden><dt>Cota del terreno</dt><dd></dd></dl>`;

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

const MINUTES_PER_YEAR = (365.25 * 24 * 60) / 100; // minutos de un 1 % del año

/** "124 min (0,0236 %)", o con "<" / ">" si la lluvia quedó fuera del rango de la P.530. */
function outageText(percent: number, bound: RainOutage['bound'] = null): string {
  const sign = bound === 'below' ? '< ' : bound === 'above' ? '> ' : '';
  return `${sign}${integerFormat.format(percent * MINUTES_PER_YEAR)} min (${sign}${percentFormat.format(percent)} %)`;
}

/** "11 GHz" o "450 MHz". */
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

export function mountLinkPage({ root, params: urlParams, shared }: PageContext): () => void {
  // Lo que dejaste en este navegador; con un enlace, lo tuyo queda aparte.
  const draft = openDraft('enlace', urlParams, shared !== null);
  const params = draft.params;
  let type: LinkType = params.get('tipo') === 'radio' ? 'radio' : 'microondas';
  // Enlace de "Compartir": la página abre con esos datos o, si no sirven, con el ejemplo de siempre.
  const linked = shared?.ok ? readLinkShare(shared.data, type) : null;
  const opened = shared && (shared.ok && !linked ? { ok: false as const, message: SHARE_BROKEN_MESSAGE } : shared);
  // Con qué abre la página: el enlace o, si no hay, lo guardado en este navegador.
  const fromLink = linked ?? (draft.data ? readLinkShare(draft.data, type) : null);
  let link: LinkParams = fromLink?.params ?? { ...PRESETS[type].params };
  let kFactor = fromLink && fromLink.kFactorId !== kFactorId(DEFAULT_K_FACTOR) ? Number(fromLink.kFactorId) : DEFAULT_K_FACTOR;
  let terrain = TERRAIN_FACTORS.find((t) => t.id === (fromLink?.terrainId ?? DEFAULT_TERRAIN_ID))!;
  let climate = CLIMATE_FACTORS.find((c) => c.id === (fromLink?.climateId ?? DEFAULT_CLIMATE_ID))!;
  let polarization: Polarization = fromLink?.polarization ?? DEFAULT_POLARIZATION;
  let rainRate = fromLink?.rainRate ?? DEFAULT_RAIN_RATE_MM_H;
  let lossModel: LossModel = fromLink?.lossModel ?? defaultLossModel(type);
  let endA: LonLat | null = fromLink ? fromLink.endA : EXAMPLE_A;
  let endB: LonLat | null = fromLink ? fromLink.endB : EXAMPLE_B;
  let profile: TerrainProfile | null = null;
  let request = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last: LinkResult | null = null;

  const page = createMapPage(
    root,
    `
    <section class="panel-section page-intro">
      <h2>Enlace punto a punto</h2>
      ${choiceHtml('tipo', [{ id: 'microondas', label: 'Microondas' }, { id: 'radio', label: 'Radioenlace VHF/UHF' }], 'Tipo de enlace')}
      ${SHARE_NOTICE_HTML}
      ${START_OVER_HTML}
    </section>
    <section class="panel-section">
      <h2>Extremos${infoButton('Escribe las coordenadas (puedes pegar las de Google Maps en Latitud), pulsa el ícono de ubicación de A o de B y haz clic donde va, o arrastra los marcadores A y B.')}</h2>
      ${endHtml('A', fromLink?.nameA ?? EXAMPLE_NAME_A)}
      ${endHtml('B', fromLink?.nameB ?? EXAMPLE_NAME_B)}
      ${simulateBoxHtml()}
    </section>
    <section class="panel-section">
      <h2>Resultado</h2>
      <div data-results><p class="hint">Pulsa "Simular" para ver el perfil y el balance del enlace.</p></div>
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
  // Con extremos de un enlace compartido, el mapa los muestra a los dos.
  const shownEnds = [endA, endB].filter((p): p is LonLat => p !== null);
  if (fromLink && shownEnds.length > 0) {
    const lons = shownEnds.map((p) => p.lon);
    const lats = shownEnds.map((p) => p.lat);
    page.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]], { padding: 80, maxZoom: 13, duration: 0 });
  }

  const results = page.find('[data-results]');
  const exporter = addExportControl(page.map, [
    { label: 'KMZ para Google Earth', description: 'Los extremos A y B con su ficha y el rayo en 3D con su cortina.', run: exportKmz },
    { label: 'Perfil en imagen (PNG)', description: 'Perfil, extremos y tabla de resultados, para informes.', run: exportProfile },
  ]);
  const linkForm = page.find('[data-link-form]');
  const propagationForm = page.find('[data-propagation-form]');

  // --- Marcadores y línea en el mapa ---

  const makeMarker = (label: EndLabel, at: LonLat) => {
    const element = document.createElement('div');
    element.className = 'end-marker';
    element.style.background = END_COLORS[label];
    // Una antena parabólica con la letra del extremo, la misma del formulario.
    element.innerHTML = `${DISH_ICON}<span class="end-marker-letter" style="color:${END_COLORS[label]}">${label}</span>`;
    element.setAttribute('aria-label', `Extremo ${label}`);
    const marker = new Marker({ element, draggable: true }).setLngLat([at.lon, at.lat]).addTo(page.map);
    marker.on('dragend', () => {
      const { lng, lat } = marker.getLngLat();
      setEnd(label, { lon: lng, lat }, true);
    });
    return marker;
  };
  const markers: Record<EndLabel, Marker> = { A: makeMarker('A', endA ?? EXAMPLE_A), B: makeMarker('B', endB ?? EXAMPLE_B) };
  const fields = {
    A: bindSiteFields(page.find('[data-site-fields="end-a"]'), (point) => setEnd('A', point, false)),
    B: bindSiteFields(page.find('[data-site-fields="end-b"]'), (point) => setEnd('B', point, false)),
  };
  if (endA) fields.A.show(endA);
  if (endB) fields.B.show(endB);

  /** Lo que tienes en la página: lo mismo para el enlace y para lo guardado en el navegador. */
  const pageData = () =>
    linkShareData(
      {
        endA,
        endB,
        nameA: fields.A.getName(),
        nameB: fields.B.getName(),
        params: link,
        kFactorId: kFactorId(kFactor),
        lossModel,
        terrainId: terrain.id,
        climateId: climate.id,
        polarization,
        rainRate,
      },
      type,
    );

  if (draft.hasOwn) showSharedNotice(page.panel, opened ?? { ok: true, data: null }, undefined, { label: 'Volver a la tuya', run: draft.backToOwn });
  else showSharedNotice(page.panel, opened);
  if (draft.restarted) showPageNotice(page.panel, 'Empezaste una simulación nueva.', { label: 'Deshacer', run: draft.undoStartOver });
  page.find('[data-start-over]').addEventListener('click', draft.startOver);
  addShareControl(page.map, {
    title: () => `Hertzo · Enlace ${frequencyLabel(link.frequencyMHz)} · ${fields.A.getName() || 'A'} → ${fields.B.getName() || 'B'}`,
    data: pageData,
  });

  /** Un extremo cambió: escrito en los campos (`fromMap` falso), elegido en el mapa o arrastrado. */
  function setEnd(label: EndLabel, point: LonLat | null, fromMap: boolean) {
    if (label === 'A') endA = point;
    else endB = point;
    // La cota mostrada es la del cálculo anterior; vuelve a aparecer al simular.
    page.find(`[data-end-elevation="${label}"]`).hidden = true;
    if (point) {
      markers[label].setLngLat([point.lon, point.lat]);
      if (fromMap) fields[label].show(point);
      else if (!page.map.getBounds().contains([point.lon, point.lat])) page.map.easeTo({ center: [point.lon, point.lat] });
    }
    refreshSimulate();
  }

  // --- Elegir un extremo en el mapa ---

  let picking: EndLabel | null = null;
  const pickButtons = Object.fromEntries(
    (['A', 'B'] as const).map((label) => [
      label,
      page.find<HTMLButtonElement>(`[data-site-fields="end-${label.toLowerCase()}"] [data-site-pick]`),
    ]),
  ) as Record<EndLabel, HTMLButtonElement>;
  const banner = createPickBanner(page.map, () => setPicking(null));
  function setPicking(label: EndLabel | null) {
    picking = label;
    page.map.getCanvas().style.cursor = label ? 'crosshair' : '';
    for (const end of ['A', 'B'] as const) pickButtons[end].setAttribute('aria-pressed', String(end === label));
    if (label) banner.show(`Haz clic en el mapa donde va el extremo ${label}.`);
    else banner.hide();
  }
  for (const end of ['A', 'B'] as const) {
    pickButtons[end].addEventListener('click', () => setPicking(picking === end ? null : end));
  }

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
  /** Línea del último cálculo, del color del veredicto. */
  const setLine = (color: string, from: LonLat, to: LonLat) => {
    if (!page.map.isStyleLoaded()) return;
    ensureLayers();
    page.map.getSource<GeoJSONSource>(LINE)!.setData({
      type: 'Feature',
      properties: { color },
      geometry: { type: 'LineString', coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
    });
  };

  // Solo con "Elegir A (o B) en el mapa" activo un clic mueve un extremo.
  page.map.on('click', (event) => {
    if (!picking) return;
    const label = picking;
    setPicking(null);
    setEnd(label, { lon: event.lngLat.lng, lat: event.lngLat.lat }, true);
  });

  const chart = createLinkChart(page.profileRoot, (d) => {
    const shown = last?.profile;
    if (!page.map.getSource(HOVER) || !shown) return;
    page.map.getSource<GeoJSONSource>(HOVER)!.setData(
      d === null
        ? empty
        : (() => {
            const p = destinationPoint(shown.from, initialBearingDeg(shown.from, shown.to), d);
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
    createFieldGroup(linkForm, linkFieldSpecs(type), link, (next) => {
      link = next;
      schedule();
    });
    propagationForm.append(
      createSelectField('Factor k de la Tierra', K_FACTORS, kFactorId(kFactor), (id) => {
        kFactor = Number(id);
        schedule();
      }).element,
      createSelectField(
        'Pérdida para el balance',
        [
          { id: 'difraccion', label: 'Espacio libre + difracción (aristas, UIT-R P.526) + gases' },
          { id: 'itm', label: 'ITM (Longley-Rice), hasta 20 GHz' },
        ],
        lossModel,
        (id) => {
          lossModel = id as LossModel;
          schedule();
        },
      ).element,
      createSelectField('Terreno (multitrayecto)', TERRAIN_FACTORS, terrain.id, (id) => {
        terrain = TERRAIN_FACTORS.find((t) => t.id === id)!;
        schedule();
      }).element,
      createSelectField('Clima (multitrayecto)', CLIMATE_FACTORS, climate.id, (id) => {
        climate = CLIMATE_FACTORS.find((c) => c.id === id)!;
        schedule();
      }).element,
    );
    if (!isMicro) return;
    propagationForm.append(
      createSelectField('Polarización', POLARIZATIONS, polarization, (id) => {
        polarization = id as Polarization;
        schedule();
      }).element,
      createNumberField(
        RAIN_FIELD,
        rainRate,
        (value) => {
          rainRate = value;
          schedule();
        },
      ).element,
    );
  }

  function antennaGainDbi(value: number): number {
    return type === 'microondas' ? parabolicGainDbi(value, link.frequencyMHz) : value;
  }

  // --- Cálculo ---

  // --- Simular ---

  const simulateButton = page.find<HTMLButtonElement>('[data-simulate]');
  const simulateHint = page.find('[data-simulate-hint]');
  let running = false;

  /** El resultado que se ve es de los extremos de ahora. */
  const upToDate = () => !!(last && endA && endB && samePoint(last.profile.from, endA) && samePoint(last.profile.to, endB));

  function refreshSimulate() {
    const ready = endA !== null && endB !== null;
    simulateButton.hidden = !running && (!ready || upToDate());
    simulateButton.disabled = running;
    simulateButton.textContent = running ? 'Simulando…' : last ? 'Simular de nuevo' : 'Simular';
    simulateHint.hidden = running || !last || !ready || upToDate();
    simulateHint.textContent = 'El perfil y el resultado son del cálculo anterior: cambiaste la ubicación de A o de B.';
  }

  async function simulate() {
    if (running) return;
    running = true;
    refreshSimulate();
    try {
      await compute();
    } finally {
      running = false;
      refreshSimulate();
    }
  }
  simulateButton.addEventListener('click', () => void simulate());

  /**
   * Cambió un equipo, la frecuencia o la propagación. Si el resultado es de los extremos de
   * ahora, se recalcula al instante con el perfil que ya se descargó; si no, espera "Simular".
   */
  function schedule() {
    clearTimeout(timer);
    if (upToDate()) timer = setTimeout(() => void compute(), 150);
    else refreshSimulate();
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
      if (!profile || !samePoint(profile.from, a) || !samePoint(profile.to, b)) {
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
    const criteria = clearanceCriteria(geometry);
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
        itmLoss = itm.pointToPoint(
          [p.elevationsM.length - 1, p.stepM, ...p.elevationsM],
          link.heightAM,
          link.heightBM,
          link.frequencyMHz,
          LINK_ITM_PARAMETERS,
        ).lossDb;
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
    const isMicro = type === 'microondas';
    // Probabilidades en % del año. El multitrayecto (Vigants-Barnett) y la lluvia (P.530-18) se
    // suman: casi nunca coinciden (el multitrayecto es de noches quietas, la lluvia de tormentas).
    const multipathPercent = 100 * multipathOutageProbability(link.frequencyMHz, dKm, Math.max(0, margin), terrain.a, climate.b);
    const rainA001 = isMicro ? rainAttenuation001Db(link.frequencyMHz, dKm, rainRate, polarization) : 0;
    const rain: RainOutage = isMicro ? rainOutagePercent(rainA001, margin, link.frequencyMHz) : { percent: 0, bound: null };
    const availability = Math.max(0, 100 - (rain.percent + multipathPercent));

    const pct = (ratio: number) => `${integerFormat.format(ratio * 100)} %`;
    const at = (m: { distanceM: number }) => `a ${twoDecimals.format(m.distanceM / 1000)} km de A`;
    const { median, worst } = criteria;
    const worstText = `con k = 2/3 (aire que curva el rayo hacia el suelo, típico de madrugadas húmedas y trayectos largos) libra el ${pct(worst.ratio)} de F1 ${at(worst)}; se pide el 60 %`;
    const verdict =
      median.ratio < 0
        ? { color: '#cf222e', label: 'Obstruido', text: `Con k = 4/3 el terreno corta la línea entre antenas ${at(median)}.` }
        : !criteria.medianOk
          ? {
              color: '#bf8700',
              label: 'Despeje parcial',
              text: `Con k = 4/3 la línea libra el ${pct(median.ratio)} de la primera zona de Fresnel ${at(median)}; se pide el 100 %.${criteria.worstOk ? '' : ` Además, ${worstText}.`}`,
            }
          : !criteria.worstOk
            ? {
                color: '#bf8700',
                label: 'Despeje parcial',
                text: `Con k = 4/3 libra el ${pct(median.ratio)} de la primera zona de Fresnel, pero ${worstText}.`,
              }
            : {
                color: '#1a7f37',
                label: 'Despejado',
                text: `Libra el 100 % de la primera zona de Fresnel con k = 4/3 (${pct(median.ratio)}) y el 60 % con k = 2/3 (${pct(worst.ratio)}).`,
              };
    setLine(verdict.color, p.from, p.to);

    const elevA = p.elevationsM[0]!;
    const elevB = p.elevationsM[p.elevationsM.length - 1]!;
    const azAB = initialBearingDeg(p.from, p.to);
    const azBA = initialBearingDeg(p.to, p.from);
    for (const [label, elevation] of [['A', elevA], ['B', elevB]] as const) {
      const box = page.find(`[data-end-elevation="${label}"]`);
      box.hidden = false;
      box.querySelector('dd')!.textContent = formatMeters(elevation);
    }

    const signed = (v: number) => `${v >= 0 ? '+' : ''}${oneDecimal.format(v)}`;
    const tiltA = elevationAngleDeg(elevA + link.heightAM, elevB + link.heightBM, p.distanceM, kFactor);
    const tiltB = elevationAngleDeg(elevB + link.heightBM, elevA + link.heightAM, p.distanceM, kFactor);
    const rows: ReportRow[] = [
      ['Veredicto', verdict.label, true, verdict.color],
      ['Distancia', `${twoDecimals.format(dKm)} km`, false],
      ['Azimut A → B / B → A', `${oneDecimal.format(azAB)}° / ${oneDecimal.format(azBA)}°`, false],
      ['Inclinación en A / en B', `${twoDecimals.format(tiltA)}° / ${twoDecimals.format(tiltB)}°`, false],
      ['Despeje con k = 4/3 (pide 100 % de F1)', `${pct(median.ratio)} de F1 a ${twoDecimals.format(median.distanceM / 1000)} km`, true],
      ['Despeje con k = 2/3 (pide 60 % de F1)', `${pct(worst.ratio)} de F1 a ${twoDecimals.format(worst.distanceM / 1000)} km`, true],
      ['Despeje mínimo con el k del perfil', `${pct(clearance.ratio)} de F1 a ${twoDecimals.format(clearance.distanceM / 1000)} km`, false],
      ['Pérdida en espacio libre', `${oneDecimal.format(fspl)} dB`, false],
      [`Difracción (${diffraction.edges.length} arista${diffraction.edges.length === 1 ? '' : 's'})`, `${oneDecimal.format(diffraction.lossDb)} dB`, false],
      ['Gases atmosféricos', `${oneDecimal.format(gases)} dB`, false],
      ['ITM (comparación)', itmLoss === null ? 'no aplica sobre 20 GHz' : `${oneDecimal.format(itmLoss)} dB`, false],
      ['Pérdida usada en el balance', `${oneDecimal.format(pathLoss)} dB`, true],
      ['Ganancia de antena A / B', `${oneDecimal.format(gainA)} / ${oneDecimal.format(gainB)} dBi`, false],
      ['PIRE', `${oneDecimal.format(eirp)} dBm`, false],
      ['Nivel recibido', `${oneDecimal.format(received)} dBm`, true],
      ['Margen de desvanecimiento', `${signed(margin)} dB`, true],
      ...(isMicro
        ? ([
            [
              'Lluvia excedida el 0,01 % del año',
              `${oneDecimal.format(rainA001)} dB (R0,01 ${integerFormat.format(rainRate)} mm/h, ${polarization})`,
              false,
            ],
            ['Corte por lluvia al año', margin > 0 ? outageText(rain.percent, rain.bound) : 'sin margen', false],
          ] satisfies ReportRow[])
        : []),
      ['Corte por multitrayecto al año', margin > 0 ? outageText(multipathPercent) : 'sin margen', false],
      [
        isMicro ? 'Disponibilidad (lluvia + multitrayecto)' : 'Disponibilidad (multitrayecto)',
        margin > 0 ? `${rain.bound === 'above' ? '< ' : ''}${percentFormat.format(availability)} %` : '—',
        true,
      ],
    ];
    const note = isMicro
      ? `Lluvia: ITU-R P.838-3 y P.530-18, con R0,01 = ${integerFormat.format(rainRate)} mm/h (95 mm/h es la zona N de la P.837-1, Andes colombianos; usa el valor de la P.837-7 para tu sitio). Multitrayecto: Vigants-Barnett. No incluye fallas de equipo.`
      : 'La disponibilidad es la de Vigants-Barnett por desvanecimiento multitrayecto; en VHF/UHF la lluvia no pesa. No incluye fallas de equipo.';
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

  /** Nombre escrito para un extremo, o vacío. */
  const endName = (label: EndLabel) => fields[label].getName();
  /** Para el archivo: "Cerro El Padre Amaya a Cerro El Volador"; vacío si ninguno tiene nombre. */
  const linkName = () => [endName('A'), endName('B')].filter(Boolean).join(' a ');

  /** Descarga una imagen PNG con el perfil, los extremos, el veredicto y la tabla de resultados. */
  async function exportProfile() {
    if (!last) return;
    const r = last;
    const { profile: p, params } = r;
    const frequency = frequencyLabel(params.frequencyMHz);
    const endLine = (label: EndLabel, at: LonLat, elevation: number, height: number) =>
      `${label}${endName(label) ? ` (${endName(label)})` : ''}: ${formatLonLat(at.lon, at.lat)} · cota ${formatMeters(elevation)} · antena a ${formatHeight(height)}`;
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
    saveFile(png, exportFileName('enlace-perfil', frequency, p.from, 'png', linkName()), 'image/png');
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
        name: endName(label) ? `${label} · ${endName(label)}` : `Extremo ${label}`,
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
    const ends = `${endName('A') || 'A'} – ${endName('B') || 'B'}`;
    const kml = linkKml(`Hertzo · Enlace ${frequency} · ${ends}`, [end('A'), end('B')], {
      name: `Enlace ${ends} · ${twoDecimals.format(p.distanceM / 1000)} km · ${frequency}`,
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
      exportFileName('enlace', frequency, p.from, 'kmz', linkName()),
      'application/vnd.google-earth.kmz',
    );
  }

  bindChoice(page.panel, 'tipo', type, (id) => {
    type = id as LinkType;
    link = { ...PRESETS[type].params };
    lossModel = defaultLossModel(type);
    buildForms();
    replaceQuery('tipo', type);
    schedule();
  });

  buildForms();
  refreshSimulate();

  draft.start(root, pageData);

  return () => {
    draft.stop();
    clearTimeout(timer);
    request++;
    page.destroy();
  };
}
