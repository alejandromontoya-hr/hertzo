// Cavernas, túneles y minas: editor de galerías, antenas y cable radiante, y propagación de la
// señal por la red de galerías (guía de onda de Emslie, curvas y acople del cable).

import { LEVEL_COLORS } from '../../coverage/colorScale';
import { bandLabels } from '../../coverage/paint';
import {
  buildGraph,
  coveredLength,
  simulate,
  type Cable,
  type CaveGraph,
  type CaveModel,
  type CaveTransmitter,
  type Gallery,
  type Point,
  type RadioSettings,
  type SimulationResult,
} from '../../cave/network';
import { CAVE_BANDS, CAVE_PRESETS, ROCKS, type CaveBand } from '../../cave/presets';
import { createPlanView, type PlanPointer, type PlanView } from '../../editor/planView';
import { distanceToSegment, newId, snap } from '../../indoor/plan';
import {
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
import { replaceQuery, type PageContext } from '../router';
import { bindSegmented, segmentedHtml } from '../shared/mapPage';

type Tool = 'select' | 'gallery' | 'antenna' | 'cable' | 'erase';
type Selection = { kind: 'gallery' | 'tx' | 'cable'; id: string } | null;
type VertexRef = { kind: 'gallery' | 'cable'; id: string; index: number };
type Drag = { kind: 'tx'; id: string } | { kind: 'vertex'; refs: VertexRef[] } | null;

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Seleccionar', hint: 'Arrastra una antena o un vértice para moverlo. Clic en una galería, antena o cable para editarlo.' },
  { id: 'gallery', label: 'Galería', hint: 'Clic para cada vértice; doble clic o Esc para terminar. Empezar o terminar sobre otra galería crea un cruce.' },
  { id: 'antenna', label: 'Antena', hint: 'Clic sobre una galería para ubicar un repetidor o un radio que transmite.' },
  { id: 'cable', label: 'Cable radiante', hint: 'Clic para cada punto del cable, siguiendo las galerías; el primer punto es la cabecera. Doble clic o Esc para terminar.' },
  { id: 'erase', label: 'Borrar', hint: 'Clic sobre una galería, antena o cable para borrarlo.' },
];

const UNCOVERED = '#cf222e';
const STORAGE_KEY = 'hertzo-cavernas-v1';
const MAX_UNDO = 60;
const SNAP_PX = 10;

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const meters = (m: number) => (m >= 1000 ? `${twoDecimals.format(m / 1000)} km` : `${integerFormat.format(m)} m`);

interface Saved {
  model: CaveModel;
  bandId: string;
  rockId: string;
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function save(data: Saved) {
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
  let roughnessM = rock.roughnessM;
  let polarization: Polarization = 'vertical';
  let corner90Db = cornerLoss90Db(band.frequencyMHz);
  let sensitivityDbm = band.sensitivityDbm;
  let cable: LeakyCable = typicalLeakyCable(band.frequencyMHz);
  let newGallery = { widthM: 4.5, heightM: 3.5 };
  let thresholds = [30, 20, 10, 0].map((m) => sensitivityDbm + m);
  let tool: Tool = 'select';
  let selection: Selection = null;
  let drawing: Point[] = [];
  let hover: { x: number; y: number; sx: number; sy: number } | null = null;
  let drag: Drag = null;
  let graph: CaveGraph = buildGraph([]);
  let result: SimulationResult | null = null;
  const undoStack: string[] = [];

  root.innerHTML = `
    <div class="page-split">
      <aside class="panel" aria-label="Galerías, antenas y cable">
        <section class="panel-section page-intro">
          <h2>Cavernas, túneles y minas</h2>
          <p class="hint">Dibuja la red de galerías, ubica antenas y cable radiante. Cada galería se comporta como una guía de onda: pierde más cuanto más baja es la frecuencia y más pequeña la sección.</p>
          ${segmentedHtml('banda', CAVE_BANDS.map((b) => ({ id: b.id, label: b.label })), 'Banda')}
          <p class="hint" data-band-hint></p>
        </section>
        <section class="panel-section">
          <h2>Escenario</h2>
          <div class="preset-buttons">${CAVE_PRESETS.map((p) => `<button type="button" class="button" data-preset="${p.id}">${p.label}</button>`).join('')}</div>
        </section>
        <section class="panel-section">
          <h2>Herramientas</h2>
          ${segmentedHtml('herramienta', TOOLS.map((t) => ({ id: t.id, label: t.label })), 'Herramienta')}
          <p class="hint" data-tool-hint></p>
          <div class="form" data-new-gallery></div>
          <div class="button-row">
            <button type="button" class="button" data-undo>Deshacer</button>
            <button type="button" class="button" data-fit>Ajustar vista</button>
          </div>
          <p class="hint">Rueda del ratón: acercar o alejar. Botón derecho: mover la vista.</p>
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
          <summary>A través de la roca (baja frecuencia)</summary>
          <p class="hint">Para comunicarse de la superficie a una galería sin cable se usa inducción magnética en baja frecuencia (kHz). La roca absorbe más cuanto más conductora es y más alta la frecuencia.</p>
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
  const bandHint = find('[data-band-hint]');
  const toolHint = find('[data-tool-hint]');
  const selectionBox = find('[data-selection]');
  const summaryBox = find('[data-summary]');
  const readout = createHoverReadout(find('.readout'));
  let opacity = 1;

  const legend = createMapLegend(find('.legend'), {
    onView() {},
    onThresholds(values) {
      thresholds = values;
      updateLegend();
      planView.redraw();
    },
    onOpacity(value) {
      opacity = value;
      planView.redraw();
    },
  });

  // --- Simulación ---

  function settings(): RadioSettings {
    return {
      frequencyMHz: band.frequencyMHz,
      polarization,
      rock: { epsilonR: rock.epsilonR, roughnessM },
      corner90Db,
      rxGainDbi: 0,
      cable,
    };
  }

  function recompute() {
    graph = buildGraph(model.galleries);
    result = simulate(model, graph, settings());
  }

  function snapshot() {
    undoStack.push(JSON.stringify(model));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function changed() {
    recompute();
    renderSelection();
    renderSummary();
    updateLegend();
    save({ model, bandId: band.id, rockId: rock.id });
    planView.redraw();
  }

  function levelColor(level: number): string {
    const sorted = [...thresholds].sort((a, b) => b - a);
    for (let i = 0; i < sorted.length; i++) if (level >= sorted[i]!) return LEVEL_COLORS[i]!;
    return UNCOVERED;
  }

  function updateLegend() {
    const sorted = [...thresholds].sort((a, b) => b - a);
    legend.update({
      views: [{ id: 'nivel', label: 'Nivel' }],
      activeView: 'nivel',
      title: `Nivel recibido en la galería (dBm), ${band.label}`,
      entries: [
        ...bandLabels(sorted, 'dBm').map((label, i) => ({ color: LEVEL_COLORS[i]!, label })),
        { color: UNCOVERED, label: `< ${sorted[sorted.length - 1]} dBm · sin cobertura` },
      ],
      thresholds: { values: thresholds, unit: 'dBm', min: -160, max: 0 },
      opacity,
    });
  }

  // --- Dibujo ---

  function draw(ctx: CanvasRenderingContext2D, v: PlanView) {
    const px = v.scale();
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
      if (selection?.kind === 'gallery' && selection.id === gallery.id) {
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
    if (result) {
      ctx.save();
      ctx.globalAlpha = opacity;
      for (let u = 0; u < graph.x.length; u++) {
        for (const edge of graph.edges[u]!) {
          if (edge.to < u) continue;
          const level = Math.min(result.levelDbm[u]!, result.levelDbm[edge.to]!);
          const gallery = model.galleries[edge.gallery]!;
          const [x1, y1] = v.toScreen(graph.x[u]!, graph.y[u]!);
          const [x2, y2] = v.toScreen(graph.x[edge.to]!, graph.y[edge.to]!);
          ctx.strokeStyle = levelColor(level);
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
    if (tool === 'select' || tool === 'gallery' || tool === 'cable') {
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
      const selected = selection?.kind === 'cable' && selection.id === c.id;
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
      const selected = selection?.kind === 'tx' && selection.id === tx.id;
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
    if ((tool === 'gallery' || tool === 'cable') && hover) {
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
    const level = result.levelDbm[best]!;
    const source = result.source[best]!;
    const sourceName =
      source >= 0 ? model.transmitters[source]?.name : source > -1000 ? 'el cable radiante' : null;
    const lines = [`${gallery.name} · ${oneDecimal.format(gallery.widthM)} × ${oneDecimal.format(gallery.heightM)} m`];
    if (!Number.isFinite(level) || !sourceName) {
      lines.push('No llega señal de ninguna fuente');
    } else if (level < -200) {
      lines.push('Menos de −200 dBm: la señal no llega');
      lines.push(`Desde ${sourceName}: ${meters(result.pathM[best]!)} por las galerías`);
    } else {
      const margin = level - sensitivityDbm;
      lines.push(`${oneDecimal.format(level)} dBm (margen ${margin >= 0 ? '+' : ''}${oneDecimal.format(margin)} dB)`);
      lines.push(
        `Desde ${sourceName}: ${meters(result.pathM[best]!)} por las galerías, ${result.bends[best]} curva${result.bends[best] === 1 ? '' : 's'}`,
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
      const alpha = galleryAttenuationDbPerM(band.frequencyMHz, g, { epsilonR: rock.epsilonR, roughnessM }, polarization);
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
          save({ model, bandId: band.id, rockId: rock.id });
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
      selectionBox.innerHTML = `<h2>${tx.name}</h2><div class="form" data-form></div>
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
        save({ model, bandId: band.id, rockId: rock.id });
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
          save({ model, bandId: band.id, rockId: rock.id });
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

  function renderSummary() {
    bandHint.textContent = band.description;
    if (!result || model.galleries.length === 0) {
      summaryBox.innerHTML = '<p class="hint">Dibuja al menos una galería con la herramienta «Galería».</p>';
      return;
    }
    const { totalM, coveredM } = coveredLength(graph, result.levelDbm, sensitivityDbm);
    const reference = model.galleries[0]!;
    const alpha = galleryAttenuationDbPerM(band.frequencyMHz, reference, { epsilonR: rock.epsilonR, roughnessM }, polarization);
    const smallest = model.galleries.reduce((a, g) => (Math.max(g.widthM, g.heightM) < Math.max(a.widthM, a.heightM) ? g : a));
    const cutoff = cutoffFrequencyMHz(smallest);
    const covered = totalM > 0 ? coveredM / totalM : 0;
    const warning =
      band.frequencyMHz < cutoff
        ? `<p class="verdict" style="border-color:${UNCOVERED}">A ${band.frequencyMHz} MHz la señal está por debajo del corte práctico de la galería más pequeña (${integerFormat.format(cutoff)} MHz): casi no avanza sin cable radiante.</p>`
        : '';
    const sources = model.transmitters.length + model.cables.length;
    summaryBox.innerHTML = `${warning}
      <table class="budget"><tbody>
        <tr class="strong"><th scope="row">Galerías con cobertura</th><td>${integerFormat.format(covered * 100)} %</td></tr>
        <tr><th scope="row">Largo cubierto / total</th><td>${meters(coveredM)} / ${meters(totalM)}</td></tr>
        <tr><th scope="row">Sin cobertura</th><td>${meters(totalM - coveredM)}</td></tr>
        <tr><th scope="row">Atenuación en «${reference.name}»</th><td>${oneDecimal.format(alpha * 100)} dB/100 m</td></tr>
        <tr><th scope="row">Pérdida en una curva de 90°</th><td>${oneDecimal.format(corner90Db)} dB</td></tr>
        <tr><th scope="row">Fuentes</th><td>${model.transmitters.length} antena${model.transmitters.length === 1 ? '' : 's'}, ${model.cables.length} cable${model.cables.length === 1 ? '' : 's'}</td></tr>
      </tbody></table>
      <p class="hint">${
        sources === 0
          ? 'Ubica una antena o un cable radiante para ver la señal.'
          : covered < 1
            ? 'Los tramos en rojo no tienen cobertura: ahí van otro repetidor o el cable radiante.'
            : 'Toda la red queda cubierta.'
      }</p>`;
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
      corner90Db,
      sensitivityDbm,
      longitudinalDbPer100m: cable.longitudinalDbPer100m,
      couplingLossDb: cable.couplingLossDb,
    };
    const fields: readonly NumberFieldSpec<keyof typeof values>[] = [
      { key: 'roughnessCm', label: 'Rugosidad de las paredes', unit: 'cm', min: 0, max: 100 },
      { key: 'corner90Db', label: 'Pérdida en una curva de 90°', unit: 'dB', min: 0, max: 80, hint: 'Valor empírico; cambia con la forma del cruce. Ajústalo con mediciones si las tienes.' },
      { key: 'sensitivityDbm', label: 'Sensibilidad del radio', unit: 'dBm', min: -140, max: -40 },
      { key: 'longitudinalDbPer100m', label: 'Cable: pérdida longitudinal', unit: 'dB/100 m', min: 0, max: 30 },
      { key: 'couplingLossDb', label: 'Cable: pérdida de acople a 2 m', unit: 'dB', min: 30, max: 110 },
    ];
    createFieldGroup(box, fields, values, (next) => {
      roughnessM = next.roughnessCm / 100;
      corner90Db = next.corner90Db;
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
        </tbody></table>
        <p class="hint">La absorción es 8,686·profundidad/δ, con δ = 503·√(ρ/f). Además el campo magnético cae con el cubo de la distancia. Roca seca: 1000 Ω·m o más; con agua: 10 a 100 Ω·m.</p>`;
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
    toolHint.textContent = TOOLS.find((t) => t.id === id)!.hint;
    find('[data-new-gallery]').hidden = id !== 'gallery';
    planView.redraw();
  };
  bindSegmented(panel, 'herramienta', tool, (id) => setTool(id as Tool));

  const bandControl = bindSegmented(panel, 'banda', band.id, (id) => selectBand(id));
  function selectBand(id: string) {
    band = CAVE_BANDS.find((b) => b.id === id)!;
    corner90Db = cornerLoss90Db(band.frequencyMHz);
    sensitivityDbm = band.sensitivityDbm;
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
      selectBand(p.band);
      planView.fit();
    });
  }

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return;
    model = JSON.parse(previous) as CaveModel;
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
    bounds() {
      const all = [...model.galleries.flatMap((g) => g.points), ...model.transmitters];
      if (all.length === 0) return { minX: 0, minY: 0, maxX: 200, maxY: 120 };
      const xs = all.map((p) => p.x);
      const ys = all.map((p) => p.y);
      const margin = 15;
      return { minX: Math.min(...xs) - margin, minY: Math.min(...ys) - margin, maxX: Math.max(...xs) + margin, maxY: Math.max(...ys) + margin };
    },
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
