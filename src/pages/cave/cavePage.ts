// Cavernas, túneles y minas: editor de galerías, antenas y cable radiante, y propagación de la
// señal por la red de galerías (guía de onda de Emslie, curvas y acople del cable), con la
// bajada (repetidor → portátil) y la subida (portátil → repetidor) por separado.

import { LEVEL_COLORS } from '../../coverage/colorScale';
import { bandLabels } from '../../coverage/paint';
import {
  antennasOutsideGalleries,
  buildGraph,
  coveredLength,
  simulate,
  type Cable,
  type CaveGraph,
  type CaveModel,
  type CaveTransmitter,
  type Gallery,
  type LinkLevels,
  type Point,
  type RadioSettings,
  type SimulationResult,
} from '../../cave/network';
import { CAVE_BANDS, CAVE_PRESETS, ROCKS, type CaveBand } from '../../cave/presets';
import { readCaveProject, type CaveProject } from '../../cave/project';
import { createPlanView, renderPlanImage, type PlanPointer, type PlanView } from '../../editor/planView';
import { saveFile } from '../../export/download';
import { isoDate } from '../../export/projectFile';
import { REPORT_CONTENT_WIDTH, REPORT_SCALE, drawReport, reportDate, swatchKey } from '../../export/reportImage';
import { PROJECT_BUTTONS_HTML, bindProjectButtons } from '../../export/projectButtons';
import { addPlanExport } from '../../map/exportControl';
import { distanceToSegment, newId, snap } from '../../indoor/plan';
import {
  DEFAULT_TILT_DEG,
  LEAKY_CABLE_MAX_MHZ,
  LEAKY_CABLE_MIN_MHZ,
  breakpointDistanceM,
  cornerLoss90Db,
  cutoffFrequencyMHz,
  galleryAttenuationDbPerM,
  rockAbsorptionDb,
  skinDepthM,
  typicalLeakyCable,
  type LeakyCable,
  type Polarization,
} from '../../rf/tunnel';
import { createMapLegend } from '../../ui/coverageLegend';
import { createFieldGroup, createSelectField, type NumberFieldSpec } from '../../ui/fields';
import { createHoverReadout } from '../../ui/hoverReadout';
import { infoButton, setInfo } from '../../ui/infoTip';
import { replaceQuery, type PageContext } from '../router';
import { bindChoice, bindSegmented, choiceHtml, segmentedHtml } from '../shared/mapPage';

type Tool = 'select' | 'gallery' | 'antenna' | 'cable' | 'erase';
type Selection = { kind: 'gallery' | 'tx' | 'cable'; id: string } | null;
type VertexRef = { kind: 'gallery' | 'cable'; id: string; index: number };
type Drag = { kind: 'tx'; id: string } | { kind: 'vertex'; refs: VertexRef[] } | null;
type View = 'bajada' | 'subida' | 'peor';

const VIEWS: { id: View; label: string; title: string }[] = [
  { id: 'bajada', label: 'Bajada', title: 'Bajada: nivel recibido en el portátil (dBm)' },
  { id: 'subida', label: 'Subida', title: 'Subida: nivel recibido en el repetidor (dBm)' },
  { id: 'peor', label: 'Peor de las dos', title: 'Peor de las dos: margen sobre la sensibilidad (dB)' },
];

/** Atenuación de la galería a partir de la cual hace falta cable radiante (dB/100 m). */
const HIGH_ATTENUATION_DB_PER_100M = 20;

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Seleccionar', hint: 'Arrastra una antena o un vértice para moverlo. Clic en una galería, antena o cable para editarlo.' },
  { id: 'gallery', label: 'Galería', hint: 'Clic para cada vértice; doble clic o Esc para terminar. Empezar o terminar sobre otra galería crea un cruce.' },
  { id: 'antenna', label: 'Antena', hint: 'Clic sobre una galería para ubicar un repetidor o un radio que transmite.' },
  { id: 'cable', label: 'Cable radiante', hint: 'Clic para cada punto del cable, siguiendo las galerías; el primer punto es la cabecera. Doble clic o Esc para terminar.' },
  { id: 'erase', label: 'Borrar', hint: 'Clic sobre una galería, antena o cable para borrarlo.' },
];

const UNCOVERED = '#2f6db3';
const STORAGE_KEY = 'hertzo-cavernas-v1';
const MAX_UNDO = 60;
const SNAP_PX = 10;

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const meters = (m: number) => (m >= 1000 ? `${twoDecimals.format(m / 1000)} km` : `${integerFormat.format(m)} m`);

/** "AM (1 MHz)", "UHF (460 MHz)", "800 MHz", "2,4 GHz": el nombre de la banda con su frecuencia. */
function bandOptionLabel(b: CaveBand): string {
  if (/^\d+$/.test(b.label)) return `${b.label} MHz`;
  if (/Hz/.test(b.label)) return b.label;
  return `${b.label} (${b.frequencyMHz} MHz)`;
}

interface Saved {
  model: CaveModel;
  bandId: string;
  rockId: string;
}

/** Entrada del historial: la red antes de un cambio, o el proyecto entero antes de abrir otro. */
type UndoEntry = { model: CaveModel } | { project: CaveProject };

/**
 * Lo último que el usuario dejó en la página: el proyecto completo (red, radio, roca y cable).
 * Lo guardado por versiones anteriores solo trae la red, la banda y la roca.
 */
function loadSaved(): (Saved & Partial<CaveProject>) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    const full = readCaveProject(data);
    if (full) return full;
    return typeof data === 'object' && data !== null && 'model' in data ? (data as Saved) : null;
  } catch {
    return null;
  }
}

function save(data: CaveProject) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Sin almacenamiento (ventana privada): la red no se recuerda.
  }
}

export function mountCavePage({ root, params }: PageContext): () => void {
  const presetId = params.get('escenario');
  const saved = presetId ? null : loadSaved();
  const preset = CAVE_PRESETS.find((p) => p.id === presetId) ?? CAVE_PRESETS[0]!;
  let model: CaveModel = saved?.model ?? preset.build();
  let band: CaveBand = CAVE_BANDS.find((b) => b.id === (saved?.bandId ?? preset.band)) ?? CAVE_BANDS[3]!;
  let rock = ROCKS.find((r) => r.id === (saved?.rockId ?? preset.rockId)) ?? ROCKS[0]!;
  let roughnessM = saved?.roughnessM ?? rock.roughnessM;
  let tiltDeg = saved?.tiltDeg ?? DEFAULT_TILT_DEG;
  let polarization: Polarization = saved?.polarization ?? 'vertical';
  /** Pérdida por curva típica de la banda, con un decimal como el resto del panel. */
  const typicalCornerDb = (f: number) => Math.round(cornerLoss90Db(f) * 10) / 10;
  let corner90Db = saved?.corner90Db ?? typicalCornerDb(band.frequencyMHz);
  let sensitivityDbm = saved?.sensitivityDbm ?? band.sensitivityDbm;
  let portablePowerDbm = saved?.portablePowerDbm !== undefined ? saved.portablePowerDbm : band.portablePowerDbm;
  let siteSensitivityDbm = saved?.siteSensitivityDbm ?? band.sensitivityDbm;
  let view: View = 'bajada';
  let cable: LeakyCable = saved?.cable ?? typicalLeakyCable(band.frequencyMHz);
  let newGallery = { widthM: 4.5, heightM: 3.5 };
  let thresholds = saved?.thresholds ?? [30, 20, 10, 0].map((m) => sensitivityDbm + m);
  let tool: Tool = 'select';
  let selection: Selection = null;
  let drawing: Point[] = [];
  let hover: { x: number; y: number; sx: number; sy: number } | null = null;
  let drag: Drag = null;
  let graph: CaveGraph = buildGraph([]);
  let result: SimulationResult | null = null;
  const undoStack: string[] = [];
  /** Al dibujar para la imagen: sin selección, vértices editables ni la línea que se está trazando. */
  let forImage = false;

  root.innerHTML = `
    <div class="page-split">
      <aside class="panel" aria-label="Galerías, antenas y cable">
        <section class="panel-section page-intro">
          <h2>Cavernas, túneles y minas${infoButton('Dibuja la red de galerías, ubica antenas y cable radiante. Cada galería se comporta como una guía de onda: pierde más cuanto más baja es la frecuencia y más pequeña la sección.')}</h2>
          ${choiceHtml('banda', CAVE_BANDS.map((b) => ({ id: b.id, label: bandOptionLabel(b) })), 'Banda', '')}
        </section>
        <section class="panel-section">
          <h2>Escenario</h2>
          <div class="preset-buttons">${CAVE_PRESETS.map((p) => `<button type="button" class="button" data-preset="${p.id}">${p.label}</button>`).join('')}</div>
          ${PROJECT_BUTTONS_HTML}
        </section>
        <section class="panel-section">
          <h2>Herramientas${infoButton('', 'data-tool-info')}</h2>
          ${segmentedHtml('herramienta', TOOLS.map((t) => ({ id: t.id, label: t.label })), 'Herramienta')}
          <div class="form" data-new-gallery></div>
          <div class="button-row">
            <button type="button" class="button" data-undo>Deshacer</button>
            <button type="button" class="button" data-fit>Ajustar vista</button>
          </div>
        </section>
        <section class="panel-section" data-selection hidden></section>
        <section class="panel-section">
          <h2>Resultado</h2>
          <div data-summary></div>
        </section>
        <details class="panel-section">
          <summary>Roca, radio y cable</summary>
          <div class="form" data-settings></div>
        </details>
        <details class="panel-section">
          <summary>A través de la roca (baja frecuencia)${infoButton(
            'Para comunicarse de la superficie a una galería sin cable se usa inducción magnética en baja frecuencia (kHz). La roca absorbe más cuanto más conductora es y más alta la frecuencia. La absorción es 8,686·profundidad/δ, con δ = 503·√(ρ/f); además el campo magnético cae con el cubo de la distancia. Roca seca: 1000 Ω·m o más; con agua: 10 a 100 Ω·m.',
          )}</summary>
          <div class="form" data-rock-calc></div>
          <div data-rock-result></div>
        </details>
      </aside>
      <div class="editor-area">
        <div class="plan-host"></div>
        <section class="legend" aria-label="Leyenda" hidden></section>
        <div class="readout" role="status" hidden></div>
      </div>
    </div>`;

  const find = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const panel = find('.panel');
  const exporter = addPlanExport(
    find('.editor-area'),
    [{ label: 'Imagen de la red (PNG)', description: 'Galerías pintadas por nivel, la leyenda y el resumen, para informes.', run: exportImage }],
    'Exportar: primero dibuja una galería',
  );
  const bandHint = find('[data-choice-info="banda"]');
  const toolHint = find('[data-tool-info]');
  const selectionBox = find('[data-selection]');
  const summaryBox = find('[data-summary]');
  const readout = createHoverReadout(find('.readout'));
  let opacity = 1;

  const legend = createMapLegend(find('.legend'), {
    onView(id) {
      view = id as View;
      updateLegend();
      planView.redraw();
    },
    onThresholds(values) {
      const offset = viewOffset();
      thresholds = values.map((v) => v - offset);
      updateLegend();
      planView.redraw();
    },
    onOpacity(value) {
      opacity = value;
      planView.redraw();
    },
  });

  // --- Simulación ---

  const rockProperties = () => ({ epsilonR: rock.epsilonR, roughnessM, tiltDeg });

  function settings(): RadioSettings {
    return {
      frequencyMHz: band.frequencyMHz,
      polarization,
      rock: rockProperties(),
      corner90Db,
      rxGainDbi: 0,
      portablePowerDbm,
      cable,
    };
  }

  function recompute() {
    graph = buildGraph(model.galleries);
    result = simulate(model, graph, settings());
  }

  function pushUndo(entry: UndoEntry) {
    undoStack.push(JSON.stringify(entry));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function snapshot() {
    pushUndo({ model });
  }

  function changed() {
    recompute();
    renderSelection();
    renderSummary();
    updateLegend();
    save(currentProject());
    planView.redraw();
  }

  /** Vistas de la banda: AM y FM son solo de recepción y no tienen subida. */
  const availableViews = () => (result?.uplink ? VIEWS : VIEWS.slice(0, 1));
  const activeView = (): View => (result?.uplink ? view : 'bajada');

  /**
   * Los umbrales se guardan sobre la sensibilidad del portátil (bajada). En la subida se corren
   * a la del repetidor y en "Peor de las dos" pasan a margen en dB.
   */
  function viewOffset(): number {
    const v = activeView();
    if (v === 'subida') return siteSensitivityDbm - sensitivityDbm;
    if (v === 'peor') return -sensitivityDbm;
    return 0;
  }
  const viewUnit = () => (activeView() === 'peor' ? 'dB' : 'dBm');
  const viewThresholds = () => thresholds.map((t) => t + viewOffset()).sort((a, b) => b - a);

  /** Margen de la peor dirección en cada nodo (dB): mín(bajada − sens. portátil, subida − sens. repetidor). */
  function worstMargin(down: LinkLevels, up: LinkLevels): Float64Array {
    return down.levelDbm.map((d, i) => Math.min(d - sensitivityDbm, up.levelDbm[i]! - siteSensitivityDbm));
  }

  /** Valor de la vista activa en cada nodo: dBm en bajada y subida, margen en dB en la peor. */
  function viewValues(): Float64Array | null {
    if (!result) return null;
    const v = activeView();
    if (v === 'subida' && result.uplink) return result.uplink.levelDbm;
    if (v === 'peor' && result.uplink) return worstMargin(result.downlink, result.uplink);
    return result.downlink.levelDbm;
  }

  function levelColor(value: number, sorted: readonly number[]): string {
    for (let i = 0; i < sorted.length; i++) if (value >= sorted[i]!) return LEVEL_COLORS[i]!;
    return UNCOVERED;
  }

  /** Franjas de nivel de la leyenda, iguales en pantalla y en la imagen. */
  function legendEntries() {
    const sorted = viewThresholds();
    const unit = viewUnit();
    return [
      ...bandLabels(sorted, unit).map((label, i) => ({ color: LEVEL_COLORS[i]!, label })),
      { color: UNCOVERED, label: `< ${sorted[sorted.length - 1]} ${unit} · sin cobertura` },
    ];
  }

  const viewTitle = () => `${VIEWS.find((v) => v.id === activeView())!.title}, ${band.label}`;

  function updateLegend() {
    const isMargin = activeView() === 'peor';
    legend.update({
      views: availableViews(),
      activeView: activeView(),
      title: viewTitle(),
      entries: legendEntries(),
      thresholds: { values: viewThresholds(), unit: viewUnit(), min: isMargin ? -60 : -160, max: isMargin ? 160 : 0 },
      opacity,
    });
  }

  // --- Dibujo ---

  function draw(ctx: CanvasRenderingContext2D, v: PlanView) {
    const px = v.scale();
    const sel = forImage ? null : selection;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Roca alrededor: cada galería como un pasaje claro con borde oscuro.
    for (const gallery of model.galleries) {
      const width = Math.max(6, gallery.widthM * px);
      const path = () => {
        ctx.beginPath();
        gallery.points.forEach((p, i) => {
          const [sx, sy] = v.toScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
      };
      if (sel?.kind === 'gallery' && sel.id === gallery.id) {
        ctx.strokeStyle = 'rgba(9,105,218,0.5)';
        ctx.lineWidth = width + 10;
        path();
        ctx.stroke();
      }
      ctx.strokeStyle = '#6e6259';
      ctx.lineWidth = width + 4;
      path();
      ctx.stroke();
      ctx.strokeStyle = '#e8e2d6';
      ctx.lineWidth = width;
      path();
      ctx.stroke();
    }

    // Nivel de señal en cada tramo del grafo.
    const values = viewValues();
    if (values) {
      const sorted = viewThresholds();
      ctx.save();
      ctx.globalAlpha = opacity;
      for (let u = 0; u < graph.x.length; u++) {
        for (const edge of graph.edges[u]!) {
          if (edge.to < u) continue;
          const level = Math.min(values[u]!, values[edge.to]!);
          const gallery = model.galleries[edge.gallery]!;
          const [x1, y1] = v.toScreen(graph.x[u]!, graph.y[u]!);
          const [x2, y2] = v.toScreen(graph.x[edge.to]!, graph.y[edge.to]!);
          ctx.strokeStyle = levelColor(level, sorted);
          ctx.lineWidth = Math.max(3, gallery.widthM * px * 0.75);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Vértices editables.
    if (!forImage && (tool === 'select' || tool === 'gallery' || tool === 'cable')) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#57606a';
      ctx.lineWidth = 1;
      for (const gallery of model.galleries) {
        for (const p of gallery.points) {
          const [sx, sy] = v.toScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(sx, sy, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    // Cables radiantes.
    for (const c of model.cables) {
      const selected = sel?.kind === 'cable' && sel.id === c.id;
      ctx.strokeStyle = selected ? '#9a6700' : '#d4a72c';
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      c.points.forEach((p, i) => {
        const [sx, sy] = v.toScreen(p.x, p.y);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      const head = c.points[0];
      if (head) {
        const [sx, sy] = v.toScreen(head.x, head.y);
        ctx.fillStyle = '#9a6700';
        ctx.fillRect(sx - 7, sy - 7, 14, 14);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 10px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('C', sx, sy + 3.5);
        ctx.textAlign = 'start';
      }
    }

    // Antenas.
    for (const tx of model.transmitters) {
      const [sx, sy] = v.toScreen(tx.x, tx.y);
      const selected = sel?.kind === 'tx' && sel.id === tx.id;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#0969da';
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(sx, sy + 6);
      ctx.lineTo(sx, sy - 5);
      ctx.moveTo(sx - 4, sy - 2);
      ctx.lineTo(sx, sy - 6);
      ctx.lineTo(sx + 4, sy - 2);
      ctx.stroke();
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(tx.name, sx, sy + 26);
      ctx.fillStyle = '#1f2328';
      ctx.fillText(tx.name, sx, sy + 26);
      ctx.textAlign = 'start';
    }

    // Polilínea que se está dibujando.
    if (!forImage && (tool === 'gallery' || tool === 'cable') && hover) {
      const target = snapTarget(hover.x, hover.y);
      const points = [...drawing, target.point];
      if (drawing.length) {
        ctx.strokeStyle = tool === 'cable' ? '#d4a72c' : '#6e6259';
        ctx.lineWidth = tool === 'cable' ? 2.5 : Math.max(4, newGallery.widthM * px);
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        points.forEach((p, i) => {
          const [sx, sy] = v.toScreen(p.x, p.y);
          if (i === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        const last = drawing[drawing.length - 1]!;
        const [lx, ly] = v.toScreen(target.point.x, target.point.y);
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#1f2328';
        ctx.fillText(meters(Math.hypot(target.point.x - last.x, target.point.y - last.y)), lx + 10, ly - 10);
      }
      const [hx, hy] = v.toScreen(target.point.x, target.point.y);
      ctx.fillStyle = target.kind === 'free' ? '#0969da' : '#cf222e';
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Ajustes de posición ---

  type SnapTarget = {
    point: Point;
    kind: 'free' | 'vertex' | 'segment';
    /** Galería y tramo sobre el que cae, si es un punto intermedio de un tramo. */
    gallery?: Gallery;
    segment?: number;
  };

  /** Ajusta a un vértice de galería, luego a un tramo de galería y, si no, a la grilla de 1 m. */
  function snapTarget(x: number, y: number): SnapTarget {
    const tolerance = SNAP_PX / planView.scale();
    let bestVertex: { p: Point; d: number } | null = null;
    for (const gallery of model.galleries) {
      for (const p of gallery.points) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d <= tolerance && (!bestVertex || d < bestVertex.d)) bestVertex = { p, d };
      }
    }
    if (bestVertex) return { point: { ...bestVertex.p }, kind: 'vertex' };
    let bestSegment: { p: Point; d: number; gallery: Gallery; segment: number } | null = null;
    for (const gallery of model.galleries) {
      for (let i = 0; i < gallery.points.length - 1; i++) {
        const a = gallery.points[i]!;
        const b = gallery.points[i + 1]!;
        const seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
        const d = distanceToSegment(x, y, seg);
        if (d <= tolerance && (!bestSegment || d < bestSegment.d)) {
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
          bestSegment = { p: { x: a.x + t * dx, y: a.y + t * dy }, d, gallery, segment: i };
        }
      }
    }
    if (bestSegment) {
      return { point: bestSegment.p, kind: 'segment', gallery: bestSegment.gallery, segment: bestSegment.segment };
    }
    const step = planView.scale() > 12 ? 0.5 : 1;
    return { point: { x: snap(x, step), y: snap(y, step) }, kind: 'free' };
  }

  /** Si el punto cae sobre un tramo de otra galería, le agrega un vértice ahí: así se forma el cruce. */
  function insertJunction(target: SnapTarget) {
    if (target.kind !== 'segment' || !target.gallery || target.segment === undefined) return;
    target.gallery.points.splice(target.segment + 1, 0, { ...target.point });
  }

  // --- Búsqueda bajo el cursor ---

  function txAt(x: number, y: number): CaveTransmitter | null {
    const tolerance = 14 / planView.scale();
    return model.transmitters.find((t) => Math.hypot(t.x - x, t.y - y) <= tolerance) ?? null;
  }

  function polylineDistance(points: Point[], x: number, y: number): number {
    let best = Infinity;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      best = Math.min(best, distanceToSegment(x, y, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
    }
    return best;
  }

  function galleryAt(x: number, y: number): Gallery | null {
    let best: { g: Gallery; d: number } | null = null;
    for (const g of model.galleries) {
      const d = polylineDistance(g.points, x, y);
      const tolerance = g.widthM / 2 + 6 / planView.scale();
      if (d <= tolerance && (!best || d < best.d)) best = { g, d };
    }
    return best?.g ?? null;
  }

  function cableAt(x: number, y: number): Cable | null {
    const tolerance = 6 / planView.scale();
    return model.cables.find((c) => polylineDistance(c.points, x, y) <= tolerance) ?? null;
  }

  function verticesAt(x: number, y: number): VertexRef[] {
    const tolerance = 8 / planView.scale();
    const all = [...model.galleries.flatMap((g) => g.points), ...model.cables.flatMap((c) => c.points)];
    const anchor = all.find((p) => Math.hypot(p.x - x, p.y - y) <= tolerance);
    if (!anchor) return [];
    // Se mueven juntos todos los vértices que coinciden en el mismo punto (cruces).
    const same = (p: Point) => Math.abs(p.x - anchor.x) < 1e-6 && Math.abs(p.y - anchor.y) < 1e-6;
    const refs: VertexRef[] = [];
    for (const g of model.galleries) g.points.forEach((p, index) => same(p) && refs.push({ kind: 'gallery', id: g.id, index }));
    for (const c of model.cables) c.points.forEach((p, index) => same(p) && refs.push({ kind: 'cable', id: c.id, index }));
    return refs;
  }

  // --- Eventos del plano ---

  function finishDrawing() {
    if (tool === 'gallery' && drawing.length >= 2) {
      snapshot();
      model.galleries.push({
        id: newId('g'),
        name: `Galería ${model.galleries.length + 1}`,
        points: drawing,
        widthM: newGallery.widthM,
        heightM: newGallery.heightM,
      });
      drawing = [];
      changed();
    } else if (tool === 'cable' && drawing.length >= 2) {
      snapshot();
      model.cables.push({ id: newId('c'), points: drawing, headPowerDbm: 33 });
      drawing = [];
      changed();
    }
    drawing = [];
    planView.redraw();
  }

  function onPointer(e: PlanPointer) {
    if (e.type === 'leave') {
      hover = null;
      readout.hide();
      planView.redraw();
      return;
    }
    hover = { x: e.x, y: e.y, sx: e.sx, sy: e.sy };

    if (tool === 'gallery' || tool === 'cable') {
      if (e.type === 'dblclick') {
        finishDrawing();
      } else if (e.type === 'down') {
        const target = snapTarget(e.x, e.y);
        const last = drawing[drawing.length - 1];
        if (!last || Math.hypot(target.point.x - last.x, target.point.y - last.y) > 0.3) {
          if (tool === 'gallery') {
            if (target.kind === 'segment') {
              snapshot();
              insertJunction(target);
            }
          }
          drawing.push(target.point);
        }
      }
      planView.redraw();
    } else if (tool === 'antenna') {
      if (e.type === 'down') {
        const target = snapTarget(e.x, e.y);
        snapshot();
        const tx: CaveTransmitter = {
          id: newId('t'),
          name: `Antena ${model.transmitters.length + 1}`,
          x: target.point.x,
          y: target.point.y,
          powerDbm: band.txPowerDbm,
          gainDbi: 0,
        };
        model.transmitters.push(tx);
        selection = { kind: 'tx', id: tx.id };
        changed();
      }
    } else if (tool === 'erase') {
      if (e.type === 'down') {
        const tx = txAt(e.x, e.y);
        const c = tx ? null : cableAt(e.x, e.y);
        const g = tx || c ? null : galleryAt(e.x, e.y);
        if (tx || c || g) {
          snapshot();
          if (tx) model.transmitters = model.transmitters.filter((t) => t.id !== tx.id);
          if (c) model.cables = model.cables.filter((x) => x.id !== c.id);
          if (g) model.galleries = model.galleries.filter((x) => x.id !== g.id);
          selection = null;
          changed();
        }
      }
    } else {
      handleSelect(e);
    }
    showReadout(e);
  }

  function handleSelect(e: PlanPointer) {
    if (e.type === 'down') {
      const tx = txAt(e.x, e.y);
      if (tx) {
        snapshot();
        drag = { kind: 'tx', id: tx.id };
        selection = { kind: 'tx', id: tx.id };
      } else {
        const refs = verticesAt(e.x, e.y);
        if (refs.length) {
          snapshot();
          drag = { kind: 'vertex', refs };
        } else {
          const c = cableAt(e.x, e.y);
          const g = c ? null : galleryAt(e.x, e.y);
          selection = c ? { kind: 'cable', id: c.id } : g ? { kind: 'gallery', id: g.id } : null;
        }
      }
      renderSelection();
      planView.redraw();
    } else if (e.type === 'move' && drag) {
      const current = drag;
      if (current.kind === 'tx') {
        const tx = model.transmitters.find((t) => t.id === current.id);
        if (tx) {
          const target = snapTarget(e.x, e.y);
          tx.x = target.point.x;
          tx.y = target.point.y;
        }
      } else {
        const step = planView.scale() > 12 ? 0.5 : 1;
        const p = { x: snap(e.x, step), y: snap(e.y, step) };
        for (const ref of current.refs) {
          const points =
            ref.kind === 'gallery'
              ? model.galleries.find((g) => g.id === ref.id)?.points
              : model.cables.find((c) => c.id === ref.id)?.points;
          if (points?.[ref.index]) points[ref.index] = { ...p };
        }
      }
      recompute();
      planView.redraw();
    } else if (e.type === 'up' && drag) {
      drag = null;
      changed();
    }
  }

  function showReadout(e: PlanPointer) {
    if (!result || graph.x.length === 0 || drag) {
      readout.hide();
      return;
    }
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < graph.x.length; i++) {
      const d = Math.hypot(graph.x[i]! - e.x, graph.y[i]! - e.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const gallery = model.galleries[graph.edges[best]?.[0]?.gallery ?? -1];
    if (best < 0 || !gallery || bestD > gallery.widthM / 2 + 8 / planView.scale()) {
      readout.hide();
      return;
    }
    const signed = (db: number) => `${db >= 0 ? '+' : ''}${oneDecimal.format(db)}`;
    /** "Bajada (en el portátil): −85,0 dBm (margen +31,0 dB)" o por qué no llega. */
    const linkLine = (label: string, level: number, sensitivity: number) => {
      if (!Number.isFinite(level)) return `${label}: no llega señal`;
      if (level < -200) return `${label}: menos de −200 dBm, la señal no llega`;
      return `${label}: ${oneDecimal.format(level)} dBm (margen ${signed(level - sensitivity)} dB)`;
    };
    const down = result.downlink;
    const source = down.source[best]!;
    const sourceName =
      source >= 0 ? model.transmitters[source]?.name : source > -1000 ? 'el cable radiante' : null;
    const lines = [`${gallery.name} · ${oneDecimal.format(gallery.widthM)} × ${oneDecimal.format(gallery.heightM)} m`];
    if (!sourceName) {
      lines.push('No llega señal de ninguna fuente');
    } else {
      lines.push(linkLine('Bajada (en el portátil)', down.levelDbm[best]!, sensitivityDbm));
      if (result.uplink) lines.push(linkLine('Subida (en el repetidor)', result.uplink.levelDbm[best]!, siteSensitivityDbm));
      const bends = down.bends[best]!;
      lines.push(
        `Desde ${sourceName}: ${meters(down.pathM[best]!)} por las galerías, ${bends} curva${bends === 1 ? '' : 's'} (${oneDecimal.format(down.bendLossDb[best]!)} dB)`,
      );
    }
    readout.show(lines, e.sx, e.sy);
  }

  // --- Panel ---

  function renderSelection() {
    selectionBox.hidden = !selection;
    if (!selection) return;
    const sel = selection;
    if (sel.kind === 'gallery') {
      const g = model.galleries.find((x) => x.id === sel.id);
      if (!g) return void (selectionBox.hidden = true);
      const alpha = galleryAttenuationDbPerM(band.frequencyMHz, g, rockProperties(), polarization);
      selectionBox.innerHTML = `<h2>${g.name}</h2>
        <p class="hint">Atenuación a ${band.label}: ${oneDecimal.format(alpha * 100)} dB/100 m; quiebre a ${meters(breakpointDistanceM(band.frequencyMHz, g))}.</p>
        <div class="form" data-form></div>
        <button type="button" class="button" data-delete>Borrar esta galería</button>`;
      createFieldGroup(
        selectionBox.querySelector<HTMLElement>('[data-form]')!,
        [
          { key: 'widthM', label: 'Ancho', unit: 'm', min: 0.5, max: 50 },
          { key: 'heightM', label: 'Alto', unit: 'm', min: 0.5, max: 50 },
        ] as const,
        { widthM: g.widthM, heightM: g.heightM },
        (next) => {
          g.widthM = next.widthM;
          g.heightM = next.heightM;
          recompute();
          renderSummary();
          save(currentProject());
          planView.redraw();
        },
      );
      selectionBox.querySelector('[data-delete]')!.addEventListener('click', () => {
        snapshot();
        model.galleries = model.galleries.filter((x) => x.id !== g.id);
        selection = null;
        changed();
      });
    } else if (sel.kind === 'tx') {
      const tx = model.transmitters.find((x) => x.id === sel.id);
      if (!tx) return void (selectionBox.hidden = true);
      selectionBox.innerHTML = `<h2>${tx.name}</h2>
        <p class="hint">Al cambiar de banda, la potencia vuelve a la típica de la banda (${integerFormat.format(band.txPowerDbm)} dBm en ${band.label}).</p>
        <div class="form" data-form></div>
        <button type="button" class="button" data-delete>Borrar esta antena</button>`;
      const fields: readonly NumberFieldSpec<'powerDbm' | 'gainDbi'>[] = [
        { key: 'powerDbm', label: 'Potencia', unit: 'dBm', min: -10, max: 60 },
        { key: 'gainDbi', label: 'Ganancia de antena', unit: 'dBi', min: -10, max: 25 },
      ];
      createFieldGroup(selectionBox.querySelector<HTMLElement>('[data-form]')!, fields, { powerDbm: tx.powerDbm, gainDbi: tx.gainDbi }, (next) => {
        tx.powerDbm = next.powerDbm;
        tx.gainDbi = next.gainDbi;
        recompute();
        renderSummary();
        save(currentProject());
        planView.redraw();
      });
      selectionBox.querySelector('[data-delete]')!.addEventListener('click', () => {
        snapshot();
        model.transmitters = model.transmitters.filter((x) => x.id !== tx.id);
        selection = null;
        changed();
      });
    } else {
      const c = model.cables.find((x) => x.id === sel.id);
      if (!c) return void (selectionBox.hidden = true);
      let length = 0;
      for (let i = 0; i < c.points.length - 1; i++) {
        length += Math.hypot(c.points[i + 1]!.x - c.points[i]!.x, c.points[i + 1]!.y - c.points[i]!.y);
      }
      selectionBox.innerHTML = `<h2>Cable radiante</h2>
        <p class="hint">${meters(length)} de cable. Pérdida en todo el largo: ${oneDecimal.format((cable.longitudinalDbPer100m * length) / 100)} dB.</p>
        <div class="form" data-form></div>
        <button type="button" class="button" data-delete>Borrar este cable</button>`;
      createFieldGroup(
        selectionBox.querySelector<HTMLElement>('[data-form]')!,
        [{ key: 'headPowerDbm', label: 'Potencia en la cabecera', unit: 'dBm', min: -10, max: 50 }] as const,
        { headPowerDbm: c.headPowerDbm },
        (next) => {
          c.headPowerDbm = next.headPowerDbm;
          recompute();
          renderSummary();
          save(currentProject());
          planView.redraw();
        },
      );
      selectionBox.querySelector('[data-delete]')!.addEventListener('click', () => {
        snapshot();
        model.cables = model.cables.filter((x) => x.id !== c.id);
        selection = null;
        changed();
      });
    }
  }

  /** Resumen del panel: avisos, filas (etiqueta, valor, resaltada) y nota. La misma tabla va a la imagen. */
  function summaryTable(): { warnings: string[]; rows: [string, string, boolean][]; note: string } | null {
    if (!result || model.galleries.length === 0) return null;
    const { downlink, uplink } = result;
    const down = coveredLength(graph, downlink.levelDbm, sensitivityDbm);
    const up = uplink ? coveredLength(graph, uplink.levelDbm, siteSensitivityDbm) : null;
    const both = uplink ? coveredLength(graph, worstMargin(downlink, uplink), 0) : down;
    const totalM = down.totalM;
    const share = (c: { coveredM: number }) => (totalM > 0 ? c.coveredM / totalM : 0);
    const percent = (c: { coveredM: number }) => `${integerFormat.format(share(c) * 100)} %`;
    const reference = model.galleries[0]!;
    const alphaOf = (g: Gallery) => galleryAttenuationDbPerM(band.frequencyMHz, g, rockProperties(), polarization);
    const smallest = model.galleries.reduce((a, g) => (Math.max(g.widthM, g.heightM) < Math.max(a.widthM, a.heightM) ? g : a));
    const cutoff = cutoffFrequencyMHz(smallest);
    const worst = model.galleries.reduce((a, g) => (alphaOf(g) > alphaOf(a) ? g : a));
    const worstPer100m = alphaOf(worst) * 100;
    const sources = model.transmitters.length + model.cables.length;

    const warnings: string[] = [];
    if (band.frequencyMHz < cutoff) {
      warnings.push(
        `A ${band.frequencyMHz} MHz la señal está por debajo del corte práctico de la galería más pequeña (${integerFormat.format(cutoff)} MHz): casi no avanza sin cable radiante.`,
      );
    } else if (worstPer100m > HIGH_ATTENUATION_DB_PER_100M) {
      warnings.push(
        `A ${band.label} la galería "${worst.name}" atenúa ${oneDecimal.format(worstPer100m)} dB/100 m: la señal se apaga en pocos cientos de metros. Para cubrirla hace falta cable radiante a lo largo de la galería.`,
      );
    }
    for (const { antenna, distanceM } of antennasOutsideGalleries(model, graph)) {
      warnings.push(
        `La antena "${antenna.name}" quedó a ${integerFormat.format(distanceM)} m de la galería más cercana, dentro de la roca: no se usa en el cálculo. Muévela dentro de una galería.`,
      );
    }
    if (model.cables.length > 0 && band.frequencyMHz < LEAKY_CABLE_MIN_MHZ) {
      warnings.push(
        `El cable radiante de 1/2" de referencia (RFS RLKW12-50) empieza en ${integerFormat.format(LEAKY_CABLE_MIN_MHZ)} MHz: a ${band.label} su pérdida de ${oneDecimal.format(cable.longitudinalDbPer100m)} dB/100 m y su acople son una estimación. Pon los datos del cable que vayas a instalar.`,
      );
    }
    if (model.cables.length > 0 && band.frequencyMHz > LEAKY_CABLE_MAX_MHZ) {
      warnings.push(
        `El cable radiante de 1/2" de referencia (RFS RLKW12-50) llega hasta ${integerFormat.format(LEAKY_CABLE_MAX_MHZ)} MHz: a ${band.label} su pérdida de ${oneDecimal.format(cable.longitudinalDbPer100m)} dB/100 m es una estimación. Pon los datos del cable que vayas a instalar.`,
      );
    }

    const rows: [string, string, boolean][] = up
      ? [
          ['Cobertura en las dos direcciones', percent(both), true],
          ['Cobertura de bajada (en el portátil)', percent(down), false],
          ['Cobertura de subida (en el repetidor)', percent(up), false],
          ['Largo cubierto en las dos / total', `${meters(both.coveredM)} / ${meters(totalM)}`, false],
        ]
      : [
          ['Cobertura de bajada (solo recepción)', percent(down), true],
          ['Largo cubierto / total', `${meters(down.coveredM)} / ${meters(totalM)}`, false],
        ];
    rows.push(
      ['Sin cobertura', meters(totalM - both.coveredM), false],
      [`Atenuación en "${reference.name}"`, `${oneDecimal.format(alphaOf(reference) * 100)} dB/100 m`, false],
      ['Pérdida en una curva de 90°', `${oneDecimal.format(corner90Db)} dB`, false],
      [
        'Fuentes',
        `${model.transmitters.length} antena${model.transmitters.length === 1 ? '' : 's'}, ${model.cables.length} cable${model.cables.length === 1 ? '' : 's'}`,
        false,
      ],
    );
    let note: string;
    if (sources === 0) note = 'Ubica una antena o un cable radiante para ver la señal.';
    else if (share(both) >= 1) note = up ? 'Toda la red queda cubierta en bajada y en subida.' : 'Toda la red queda cubierta.';
    else if (up && share(down) - share(up) >= 0.01)
      note = `La subida cubre menos que la bajada: el portátil transmite con ${oneDecimal.format(portablePowerDbm ?? 0)} dBm. Los tramos en azul de la vista "Subida" necesitan otro repetidor o cable radiante.`;
    else note = 'Los tramos en azul no tienen cobertura: ahí van otro repetidor o el cable radiante.';
    return { warnings, rows, note };
  }

  function renderSummary() {
    setInfo(bandHint, band.description);
    exporter.setEnabled(result !== null && model.galleries.length > 0);
    const table = summaryTable();
    if (!table) {
      summaryBox.innerHTML = '<p class="hint">Dibuja al menos una galería con la herramienta "Galería".</p>';
      return;
    }
    const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    summaryBox.innerHTML = `
      <table class="budget"><tbody>
        ${table.rows
          .map(([label, value, strong]) => `<tr${strong ? ' class="strong"' : ''}><th scope="row">${escape(label)}</th><td>${value}</td></tr>`)
          .join('')}
      </tbody></table>
      ${table.warnings.map((w) => `<p class="notice">${escape(w)}</p>`).join('')}
      <p class="hint">${table.note}</p>`;
  }

  /** Rectángulo que encuadra galerías y antenas, con 15 m de margen. */
  function planBounds() {
    const all = [...model.galleries.flatMap((g) => g.points), ...model.transmitters];
    if (all.length === 0) return { minX: 0, minY: 0, maxX: 200, maxY: 120 };
    const xs = all.map((p) => p.x);
    const ys = all.map((p) => p.y);
    const margin = 15;
    return { minX: Math.min(...xs) - margin, minY: Math.min(...ys) - margin, maxX: Math.max(...xs) + margin, maxY: Math.max(...ys) + margin };
  }

  /** Descarga una imagen PNG con la red de galerías pintada por nivel, la leyenda y el resumen. */
  async function exportImage() {
    const summary = summaryTable();
    if (!summary) return;
    const b = planBounds();
    // Alto según la forma de la red, entre 280 y 620 px.
    const height = Math.round(
      Math.min(620, Math.max(280, ((REPORT_CONTENT_WIDTH - 160) * (b.maxY - b.minY)) / (b.maxX - b.minX) + 160)),
    );
    forImage = true;
    let figure: HTMLCanvasElement;
    try {
      // 80 px de margen: el nombre de una antena en el extremo de la red no se corta.
      figure = renderPlanImage({ bounds: planBounds, draw }, REPORT_CONTENT_WIDTH, height, REPORT_SCALE, 80);
    } finally {
      forImage = false;
    }
    const cableKey = {
      label: 'Cable radiante',
      draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
        ctx.save();
        ctx.strokeStyle = '#d4a72c';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y);
        ctx.stroke();
        ctx.restore();
      },
    };
    const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const png = await drawReport({
      title: `Radio en túneles, minas y cavernas · ${band.label} (${integerFormat.format(band.frequencyMHz)} MHz)`,
      subtitle: [
        `${count(model.galleries.length, 'galería')} · ${count(model.transmitters.length, 'antena')} · ${count(model.cables.length, 'cable')} · ${rock.label}`,
        `${viewTitle()} · polarización ${polarization} · ${reportDate()}`,
      ],
      figure,
      figureHeight: height,
      key: [...legendEntries().map((e) => swatchKey(e.label, e.color)), cableKey],
      notice: summary.warnings.length ? summary.warnings.join(' ') : undefined,
      rows: summary.rows,
      note: summary.note,
    });
    saveFile(png, `hertzo-cavernas-${band.id}-${activeView()}-${isoDate(new Date())}.png`, 'image/png');
  }

  function renderSettings() {
    const box = find('[data-settings]');
    box.replaceChildren();
    box.append(
      createSelectField('Roca', ROCKS, rock.id, (id) => {
        rock = ROCKS.find((r) => r.id === id)!;
        roughnessM = rock.roughnessM;
        renderSettings();
        changed();
      }).element,
      createSelectField(
        'Polarización de las antenas',
        [
          { id: 'vertical', label: 'Vertical (radios portátiles)' },
          { id: 'horizontal', label: 'Horizontal' },
        ],
        polarization,
        (id) => {
          polarization = id as Polarization;
          changed();
        },
      ).element,
    );
    const values = {
      roughnessCm: roughnessM * 100,
      tiltDeg,
      corner90Db,
      sensitivityDbm,
      portablePowerDbm: portablePowerDbm ?? 0,
      siteSensitivityDbm,
      longitudinalDbPer100m: cable.longitudinalDbPer100m,
      couplingLossDb: cable.couplingLossDb,
    };
    const hasUplink = portablePowerDbm !== null;
    const uplinkFields: NumberFieldSpec<keyof typeof values>[] = [
      { key: 'portablePowerDbm', label: 'Potencia del portátil (subida)', unit: 'dBm', min: -10, max: 50 },
      { key: 'siteSensitivityDbm', label: 'Sensibilidad del repetidor (subida)', unit: 'dBm', min: -140, max: -40 },
    ];
    const fields: readonly NumberFieldSpec<keyof typeof values>[] = [
      { key: 'roughnessCm', label: 'Rugosidad de las paredes', unit: 'cm', min: 0, max: 100 },
      {
        key: 'tiltDeg',
        label: 'Inclinación de las paredes',
        unit: '°',
        min: 0,
        max: 10,
        hint: 'Cuánto se desvían las paredes del eje de la galería. Suma 4,343·π²·θ²/λ dB/m (Emslie): con 1°, 3,9 dB/100 m a 900 MHz, el valor que usa NIOSH.',
      },
      { key: 'corner90Db', label: 'Pérdida en una curva de 90°', unit: 'dB', min: 0, max: 80, hint: 'Valor empírico, sin fuente medida; cambia con la forma del cruce. Ajústalo con mediciones si las tienes.' },
      { key: 'sensitivityDbm', label: 'Sensibilidad del portátil (bajada)', unit: 'dBm', min: -140, max: -40 },
      ...(hasUplink ? uplinkFields : []),
      { key: 'longitudinalDbPer100m', label: 'Cable: pérdida longitudinal', unit: 'dB/100 m', min: 0, max: 40, hint: 'Por defecto, la de la hoja del RFS RLKW12-50 de 1/2" a la frecuencia de la banda.' },
      { key: 'couplingLossDb', label: 'Cable: pérdida de acople a 2 m', unit: 'dB', min: 30, max: 110, hint: 'Por defecto, la del RFS RLKW12-50 al 95 % a 2 m.' },
    ];
    createFieldGroup(box, fields, values, (next) => {
      roughnessM = next.roughnessCm / 100;
      tiltDeg = next.tiltDeg;
      corner90Db = next.corner90Db;
      if (hasUplink) {
        portablePowerDbm = next.portablePowerDbm;
        siteSensitivityDbm = next.siteSensitivityDbm;
      }
      if (next.sensitivityDbm !== sensitivityDbm) {
        const delta = next.sensitivityDbm - sensitivityDbm;
        thresholds = thresholds.map((t) => t + delta);
        sensitivityDbm = next.sensitivityDbm;
      }
      cable = { longitudinalDbPer100m: next.longitudinalDbPer100m, couplingLossDb: next.couplingLossDb };
      changed();
    });
  }

  function renderRockCalculator() {
    const values = { depthM: 300, resistivityOhmM: 100, frequencyKHz: 1 };
    const out = find('[data-rock-result]');
    const show = (v: typeof values) => {
      const delta = skinDepthM(v.resistivityOhmM, v.frequencyKHz * 1000);
      const absorption = rockAbsorptionDb(v.depthM, v.resistivityOhmM, v.frequencyKHz * 1000);
      out.innerHTML = `<table class="budget"><tbody>
          <tr><th scope="row">Profundidad de penetración</th><td>${meters(delta)}</td></tr>
          <tr class="strong"><th scope="row">Absorción en ${meters(v.depthM)} de roca</th><td>${oneDecimal.format(absorption)} dB</td></tr>
          <tr><th scope="row">Caída por distancia (campo magnético)</th><td>60 dB por década</td></tr>
        </tbody></table>`;
    };
    createFieldGroup(
      find('[data-rock-calc]'),
      [
        { key: 'depthM', label: 'Espesor de roca', unit: 'm', min: 1, max: 3000 },
        { key: 'resistivityOhmM', label: 'Resistividad de la roca', unit: 'Ω·m', min: 0.1, max: 100000 },
        { key: 'frequencyKHz', label: 'Frecuencia', unit: 'kHz', min: 0.01, max: 1000 },
      ] as const,
      values,
      show,
    );
    show(values);
  }

  // --- Controles ---

  createFieldGroup(
    find('[data-new-gallery]'),
    [
      { key: 'widthM', label: 'Ancho de la galería nueva', unit: 'm', min: 0.5, max: 50 },
      { key: 'heightM', label: 'Alto de la galería nueva', unit: 'm', min: 0.5, max: 50 },
    ] as const,
    newGallery,
    (next) => {
      newGallery = next;
    },
  );

  const setTool = (id: Tool) => {
    if (drawing.length) finishDrawing();
    tool = id;
    drawing = [];
    setInfo(toolHint, `${TOOLS.find((t) => t.id === id)!.hint} Rueda del ratón: acercar o alejar. Botón derecho: mover la vista.`);
    find('[data-new-gallery]').hidden = id !== 'gallery';
    planView.redraw();
  };
  bindSegmented(panel, 'herramienta', tool, (id) => setTool(id as Tool));

  const bandControl = bindChoice(panel, 'banda', band.id, (id) => selectBand(id, true));
  /**
   * Cambia de banda y pone los valores típicos de ella. Si lo pide el usuario (`setPower`), las
   * antenas también pasan a la potencia típica de la banda: un repetidor UHF de 40 dBm no
   * puede quedar como punto de acceso WiFi de 43 dBm PIRE. Los escenarios de ejemplo traen su
   * propia potencia y no la tocan.
   */
  function selectBand(id: string, setPower: boolean) {
    band = CAVE_BANDS.find((b) => b.id === id)!;
    if (setPower && model.transmitters.some((t) => t.powerDbm !== band.txPowerDbm)) {
      snapshot();
      for (const tx of model.transmitters) tx.powerDbm = band.txPowerDbm;
    }
    corner90Db = typicalCornerDb(band.frequencyMHz);
    sensitivityDbm = band.sensitivityDbm;
    portablePowerDbm = band.portablePowerDbm;
    siteSensitivityDbm = band.sensitivityDbm;
    cable = typicalLeakyCable(band.frequencyMHz);
    thresholds = [30, 20, 10, 0].map((m) => sensitivityDbm + m);
    bandControl.set(band.id);
    renderSettings();
    changed();
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    button.addEventListener('click', () => {
      const p = CAVE_PRESETS.find((x) => x.id === button.dataset.preset)!;
      snapshot();
      model = p.build();
      rock = ROCKS.find((r) => r.id === p.rockId)!;
      roughnessM = rock.roughnessM;
      selection = null;
      drawing = [];
      readout.hide();
      replaceQuery('escenario', p.id);
      selectBand(p.band, false);
      planView.fit();
    });
  }

  function currentProject(): CaveProject {
    return {
      model,
      bandId: band.id,
      rockId: rock.id,
      roughnessM,
      tiltDeg,
      polarization,
      corner90Db,
      sensitivityDbm,
      portablePowerDbm,
      siteSensitivityDbm,
      cable,
      thresholds,
    };
  }

  bindProjectButtons(panel, {
    scenario: 'cavernas',
    collect: currentProject,
    read: readCaveProject,
    apply(data) {
      pushUndo({ project: currentProject() });
      applyProject(data);
    },
  });

  /** Pone en la página un proyecto abierto de un archivo (o el anterior, al deshacer). */
  function applyProject(data: CaveProject) {
    model = data.model;
    band = CAVE_BANDS.find((b) => b.id === data.bandId)!;
    rock = ROCKS.find((r) => r.id === data.rockId)!;
    roughnessM = data.roughnessM;
    tiltDeg = data.tiltDeg;
    polarization = data.polarization;
    corner90Db = data.corner90Db;
    sensitivityDbm = data.sensitivityDbm;
    portablePowerDbm = data.portablePowerDbm;
    siteSensitivityDbm = data.siteSensitivityDbm;
    cable = data.cable;
    thresholds = data.thresholds;
    selection = null;
    drawing = [];
    readout.hide();
    bandControl.set(band.id);
    // Sin "?escenario=…" en la dirección, al recargar se ve este proyecto y no el de ejemplo.
    replaceQuery('escenario', null);
    renderSettings();
    changed();
    planView.fit();
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return;
    const entry = JSON.parse(previous) as UndoEntry;
    if ('project' in entry) return applyProject(entry.project);
    model = entry.model;
    selection = null;
    drawing = [];
    changed();
  }
  find('[data-undo]').addEventListener('click', undo);
  find('[data-fit]').addEventListener('click', () => planView.fit());

  const onKey = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'Escape') {
      if (drawing.length) finishDrawing();
      else {
        selection = null;
        renderSelection();
        planView.redraw();
      }
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
      snapshot();
      const id = selection.id;
      if (selection.kind === 'gallery') model.galleries = model.galleries.filter((g) => g.id !== id);
      if (selection.kind === 'tx') model.transmitters = model.transmitters.filter((t) => t.id !== id);
      if (selection.kind === 'cable') model.cables = model.cables.filter((c) => c.id !== id);
      selection = null;
      changed();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  };
  window.addEventListener('keydown', onKey);

  const planView = createPlanView(find('.plan-host'), {
    bounds: planBounds,
    draw,
    onPointer,
  });

  setTool('select');
  renderSettings();
  renderRockCalculator();
  changed();

  return () => {
    window.removeEventListener('keydown', onKey);
    planView.destroy();
  };
}
