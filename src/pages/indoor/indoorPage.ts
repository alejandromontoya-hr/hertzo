// Interiores (WiFi): editor de planos con muros de distintos materiales y access points,
// y mapa de calor de señal con el modelo multipared.

import { paintBands, paintCategories, bandLabels } from '../../coverage/paint';
import { createPlanView, type PlanPointer, type PlanView } from '../../editor/planView';
import { PROJECT_BUTTONS_HTML, bindProjectButtons } from '../../export/projectButtons';
import {
  computeHeatmap,
  coverageFraction,
  distanceToSegment,
  newId,
  snap,
  type AccessPoint,
  type FloorPlan,
  type Heatmap,
  type Wall,
} from '../../indoor/plan';
import { PLAN_PRESETS } from '../../indoor/presets';
import { readIndoorProject, type IndoorProject } from '../../indoor/project';
import {
  MATERIALS,
  WIFI_BANDS,
  WIFI_THRESHOLDS,
  materialById,
  multiWallLossDb,
  type MaterialId,
  type WifiBand,
} from '../../rf/indoor';
import { createMapLegend } from '../../ui/coverageLegend';
import { createFieldGroup, createSelectField, type NumberFieldSpec } from '../../ui/fields';
import { createHoverReadout } from '../../ui/hoverReadout';
import { replaceQuery, type PageContext } from '../router';
import { bindSegmented, segmentedHtml } from '../shared/mapPage';

type Tool = 'select' | 'wall' | 'ap' | 'erase';
type View = 'rssi' | 'best';
type Selection = { kind: 'wall'; id: string } | { kind: 'ap'; id: string } | null;
type Drag =
  | { kind: 'ap'; id: string }
  | { kind: 'endpoint'; ends: { id: string; end: 1 | 2 }[] }
  | { kind: 'wall'; id: string; fromX: number; fromY: number; original: Wall }
  | null;

const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: 'select', label: 'Seleccionar', hint: 'Arrastra un AP o un muro para moverlo, o el extremo de un muro para estirarlo. Clic para editarlo.' },
  { id: 'wall', label: 'Muro', hint: 'Clic para empezar y clic para terminar; los muros se encadenan. Esc o doble clic para soltar. Shift: solo horizontal o vertical.' },
  { id: 'ap', label: 'Access point', hint: 'Clic en el plano para ubicar un access point.' },
  { id: 'erase', label: 'Borrar', hint: 'Clic sobre un muro o un access point para borrarlo.' },
];

const HEAT_COLORS = ['#1a9850', '#91cf60', '#f6d32d', '#fc8d59', '#d73027'];
const AP_COLORS = ['#1f5c8c', '#d95f0e', '#6b8e23', '#8c2d4a', '#2a8c82', '#b8860b'];
const SNAP_STEP_M = 0.25;
const SNAP_ENDPOINT_PX = 10;
const STORAGE_KEY = 'hertzo-interiores-v1';
const MAX_UNDO = 60;

const oneDecimal = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const integerFormat = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const meters = (m: number) => `${oneDecimal.format(m)} m`;

interface Saved {
  plan: FloorPlan;
  band: WifiBand;
}

/** Entrada del historial: el plano antes de un cambio, o el proyecto entero antes de abrir otro. */
type UndoEntry = { plan: FloorPlan } | { project: IndoorProject };

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
    // Sin almacenamiento (ventana privada): el plano simplemente no se recuerda.
  }
}

export function mountIndoorPage({ root, params }: PageContext): () => void {
  const presetId = params.get('plano');
  const saved = presetId ? null : loadSaved();
  let plan: FloorPlan = saved?.plan ?? (PLAN_PRESETS.find((p) => p.id === presetId) ?? PLAN_PRESETS[0]!).build();
  let band: WifiBand = saved?.band ?? '2.4';
  let tool: Tool = 'select';
  let newMaterial: MaterialId = 'ladrillo';
  let selection: Selection = null;
  let drawingFrom: { x: number; y: number } | null = null;
  let hover: { x: number; y: number } | null = null;
  let drag: Drag = null;
  let view: View = 'rssi';
  let thresholds = WIFI_THRESHOLDS.map((t) => t.dbm);
  let opacity = 0.65;
  let heatmap: Heatmap | null = null;
  const undoStack: string[] = [];
  const heatCanvas = document.createElement('canvas');

  root.innerHTML = `
    <div class="page-split">
      <aside class="panel" aria-label="Plano y access points">
        <section class="panel-section page-intro">
          <h2>Interiores (WiFi)</h2>
          <p class="hint">Dibuja el plano con sus muros, elige el material de cada uno y ubica los access points. El mapa de calor usa el modelo multipared.</p>
          ${segmentedHtml('banda', WIFI_BANDS.map((b) => ({ id: b.id, label: b.label })), 'Banda WiFi')}
        </section>
        <section class="panel-section">
          <h2>Plano</h2>
          <div class="preset-buttons">${PLAN_PRESETS.map((p) => `<button type="button" class="button" data-preset="${p.id}">${p.label}</button>`).join('')}</div>
          <div class="form" data-size></div>
          ${PROJECT_BUTTONS_HTML}
        </section>
        <section class="panel-section">
          <h2>Herramientas</h2>
          ${segmentedHtml('herramienta', TOOLS.map((t) => ({ id: t.id, label: t.label })), 'Herramienta')}
          <p class="hint" data-tool-hint></p>
          <div class="form" data-material></div>
          <div class="button-row">
            <button type="button" class="button" data-undo>Deshacer</button>
            <button type="button" class="button" data-fit>Ajustar vista</button>
          </div>
          <p class="hint">Rueda del ratón: acercar o alejar. Botón derecho: mover la vista.</p>
        </section>
        <section class="panel-section" data-selection hidden></section>
        <section class="panel-section">
          <h2>Access points</h2>
          <div data-aps></div>
        </section>
        <section class="panel-section">
          <h2>Resultado</h2>
          <div data-summary></div>
        </section>
        <details class="panel-section">
          <summary>Pérdida de cada material</summary>
          <div data-materials></div>
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
  const toolHint = find('[data-tool-hint]');
  const selectionBox = find('[data-selection]');
  const apsBox = find('[data-aps]');
  const summaryBox = find('[data-summary]');
  const materialsBox = find('[data-materials]');
  const readout = createHoverReadout(find('.readout'));

  const legend = createMapLegend(find('.legend'), {
    onView(id) {
      view = id as View;
      paintHeat();
      planView.redraw();
    },
    onThresholds(values) {
      thresholds = values;
      paintHeat();
      planView.redraw();
    },
    onOpacity(value) {
      opacity = value;
      planView.redraw();
    },
  });

  // --- Historial y cambios ---

  function pushUndo(entry: UndoEntry) {
    undoStack.push(JSON.stringify(entry));
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  }

  function snapshot() {
    pushUndo({ plan });
  }

  function changed() {
    heatmap = computeHeatmap(plan, band);
    paintHeat();
    renderAps();
    renderSelection();
    renderSummary();
    save({ plan, band });
    planView.redraw();
  }

  // --- Mapa de calor ---

  function paintHeat() {
    if (!heatmap) return;
    heatCanvas.width = heatmap.cols;
    heatCanvas.height = heatmap.rows;
    const pixels = new Uint8ClampedArray(heatmap.cols * heatmap.rows * 4);
    const size = { width: heatmap.cols, height: heatmap.rows };
    if (view === 'rssi') {
      paintBands(size, heatmap.rssiDbm, thresholds, HEAT_COLORS, null, pixels);
    } else {
      paintCategories(size, heatmap.bestAp, AP_COLORS, null, pixels);
    }
    heatCanvas.getContext('2d')!.putImageData(new ImageData(pixels, heatmap.cols, heatmap.rows), 0, 0);
    const sorted = [...thresholds].sort((a, b) => b - a);
    legend.update({
      views: [
        { id: 'rssi', label: 'Señal' },
        { id: 'best', label: 'Mejor AP' },
      ],
      activeView: view,
      title: view === 'rssi' ? 'Señal recibida (dBm)' : 'Access point que da la mejor señal',
      entries:
        view === 'rssi'
          ? bandLabels(sorted, 'dBm').map((label, i) => ({
              color: HEAT_COLORS[i]!,
              label: sorted.join() === WIFI_THRESHOLDS.map((t) => t.dbm).join() ? `${label} · ${WIFI_THRESHOLDS[i]!.label}` : label,
            }))
          : plan.aps.map((ap, i) => ({ color: AP_COLORS[i % AP_COLORS.length]!, label: ap.name })),
      emptyLabel: view === 'rssi' ? 'sin servicio' : undefined,
      thresholds: view === 'rssi' ? { values: thresholds, unit: 'dBm', min: -120, max: -20 } : undefined,
      opacity,
    });
  }

  // --- Dibujo ---

  function draw(ctx: CanvasRenderingContext2D, v: PlanView) {
    const px = v.scale();
    const [ox, oy] = v.toScreen(0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox, oy, plan.widthM * px, plan.heightM * px);
    if (heatmap) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(heatCanvas, ox, oy, plan.widthM * px, plan.heightM * px);
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(27,31,36,0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(ox, oy, plan.widthM * px, plan.heightM * px);
    ctx.setLineDash([]);

    ctx.lineCap = 'round';
    for (const wall of plan.walls) {
      const [x1, y1] = v.toScreen(wall.x1, wall.y1);
      const [x2, y2] = v.toScreen(wall.x2, wall.y2);
      const material = materialById(wall.material);
      if (selection?.kind === 'wall' && selection.id === wall.id) {
        ctx.strokeStyle = 'rgba(9,105,218,0.45)';
        ctx.lineWidth = material.drawWidth + 8;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.strokeStyle = material.color;
      ctx.lineWidth = material.drawWidth;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (tool === 'select' || tool === 'wall') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#57606a';
      ctx.lineWidth = 1;
      for (const wall of plan.walls) {
        for (const [x, y] of [[wall.x1, wall.y1], [wall.x2, wall.y2]] as const) {
          const [sx, sy] = v.toScreen(x, y);
          ctx.beginPath();
          ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    plan.aps.forEach((ap, i) => {
      const [sx, sy] = v.toScreen(ap.x, ap.y);
      const color = AP_COLORS[i % AP_COLORS.length]!;
      const selected = selection?.kind === 'ap' && selection.id === ap.id;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = color;
      ctx.lineWidth = selected ? 4 : 2.5;
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.8;
      for (const r of [3.5, 6.5]) {
        ctx.beginPath();
        ctx.arc(sx, sy + 3, r, -Math.PI * 0.8, -Math.PI * 0.2);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy + 3, 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeText(ap.name, sx, sy + 26);
      ctx.fillStyle = '#1f2328';
      ctx.fillText(ap.name, sx, sy + 26);
      ctx.textAlign = 'start';
    });

    if (tool === 'wall' && hover) {
      const target = snapPoint(hover.x, hover.y, false);
      const [hx, hy] = v.toScreen(target.x, target.y);
      if (drawingFrom) {
        const end = constrain(drawingFrom, target, shiftHeld);
        const [fx, fy] = v.toScreen(drawingFrom.x, drawingFrom.y);
        const [ex, ey] = v.toScreen(end.x, end.y);
        ctx.strokeStyle = materialById(newMaterial).color;
        ctx.lineWidth = materialById(newMaterial).drawWidth;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.setLineDash([]);
        const length = Math.hypot(end.x - drawingFrom.x, end.y - drawingFrom.y);
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = '#1f2328';
        ctx.fillText(meters(length), (fx + ex) / 2 + 8, (fy + ey) / 2 - 8);
      }
      ctx.fillStyle = target.snappedToEnd ? '#cf222e' : '#0969da';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- Ajustes de posición ---

  let shiftHeld = false;

  /** Ajusta a un extremo de muro cercano o, si no hay, a la grilla de 25 cm. */
  function snapPoint(x: number, y: number, free: boolean): { x: number; y: number; snappedToEnd: boolean } {
    const tolerance = SNAP_ENDPOINT_PX / planView.scale();
    let best: { x: number; y: number; d: number } | null = null;
    for (const wall of plan.walls) {
      for (const [ex, ey] of [[wall.x1, wall.y1], [wall.x2, wall.y2]] as const) {
        const d = Math.hypot(ex - x, ey - y);
        if (d <= tolerance && (!best || d < best.d)) best = { x: ex, y: ey, d };
      }
    }
    if (best) return { x: best.x, y: best.y, snappedToEnd: true };
    const clampX = (v: number) => Math.min(plan.widthM, Math.max(0, v));
    const clampY = (v: number) => Math.min(plan.heightM, Math.max(0, v));
    if (free) return { x: clampX(x), y: clampY(y), snappedToEnd: false };
    return { x: clampX(snap(x, SNAP_STEP_M)), y: clampY(snap(y, SNAP_STEP_M)), snappedToEnd: false };
  }

  /** Con Shift, el muro queda horizontal o vertical. */
  function constrain(from: { x: number; y: number }, to: { x: number; y: number }, active: boolean) {
    if (!active) return to;
    return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  }

  // --- Búsqueda bajo el cursor ---

  function apAt(x: number, y: number): AccessPoint | null {
    const tolerance = 14 / planView.scale();
    return plan.aps.find((ap) => Math.hypot(ap.x - x, ap.y - y) <= tolerance) ?? null;
  }

  function wallAt(x: number, y: number): Wall | null {
    let best: { wall: Wall; d: number } | null = null;
    for (const wall of plan.walls) {
      const d = distanceToSegment(x, y, wall);
      const tolerance = (materialById(wall.material).drawWidth / 2 + 5) / planView.scale();
      if (d <= tolerance && (!best || d < best.d)) best = { wall, d };
    }
    return best?.wall ?? null;
  }

  function endpointsAt(x: number, y: number): { id: string; end: 1 | 2 }[] {
    const tolerance = 8 / planView.scale();
    const ends: { id: string; end: 1 | 2 }[] = [];
    let anchor: { x: number; y: number } | null = null;
    for (const wall of plan.walls) {
      for (const end of [1, 2] as const) {
        const ex = end === 1 ? wall.x1 : wall.x2;
        const ey = end === 1 ? wall.y1 : wall.y2;
        if (!anchor && Math.hypot(ex - x, ey - y) <= tolerance) anchor = { x: ex, y: ey };
        // Se mueven juntos todos los extremos que coinciden en el mismo punto.
        if (anchor && Math.abs(ex - anchor.x) < 1e-6 && Math.abs(ey - anchor.y) < 1e-6) ends.push({ id: wall.id, end });
      }
    }
    return anchor ? ends : [];
  }

  // --- Eventos del plano ---

  function onPointer(e: PlanPointer) {
    shiftHeld = e.shiftKey;
    if (e.type === 'leave') {
      hover = null;
      readout.hide();
      planView.redraw();
      return;
    }
    hover = { x: e.x, y: e.y };

    if (e.type === 'dblclick') {
      drawingFrom = null;
      planView.redraw();
      return;
    }

    if (tool === 'wall') {
      if (e.type === 'down') {
        const point = snapPoint(e.x, e.y, e.altKey);
        if (!drawingFrom) {
          drawingFrom = { x: point.x, y: point.y };
        } else {
          const end = constrain(drawingFrom, point, e.shiftKey);
          if (Math.hypot(end.x - drawingFrom.x, end.y - drawingFrom.y) >= 0.1) {
            snapshot();
            plan.walls.push({ id: newId('w'), x1: drawingFrom.x, y1: drawingFrom.y, x2: end.x, y2: end.y, material: newMaterial });
            drawingFrom = { x: end.x, y: end.y };
            changed();
          }
        }
      }
      planView.redraw();
    } else if (tool === 'ap') {
      if (e.type === 'down') {
        snapshot();
        const point = snapPoint(e.x, e.y, true);
        const ap: AccessPoint = { id: newId('ap'), name: `AP ${plan.aps.length + 1}`, x: point.x, y: point.y, powerDbm: 20, gainDbi: 3 };
        plan.aps.push(ap);
        selection = { kind: 'ap', id: ap.id };
        changed();
      }
    } else if (tool === 'erase') {
      if (e.type === 'down') {
        const ap = apAt(e.x, e.y);
        const wall = ap ? null : wallAt(e.x, e.y);
        if (ap || wall) {
          snapshot();
          if (ap) plan.aps = plan.aps.filter((a) => a.id !== ap.id);
          if (wall) plan.walls = plan.walls.filter((w) => w.id !== wall.id);
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
      const ap = apAt(e.x, e.y);
      if (ap) {
        snapshot();
        drag = { kind: 'ap', id: ap.id };
        selection = { kind: 'ap', id: ap.id };
      } else {
        const ends = endpointsAt(e.x, e.y);
        if (ends.length) {
          snapshot();
          drag = { kind: 'endpoint', ends };
        } else {
          const wall = wallAt(e.x, e.y);
          if (wall) {
            snapshot();
            drag = { kind: 'wall', id: wall.id, fromX: e.x, fromY: e.y, original: { ...wall } };
            selection = { kind: 'wall', id: wall.id };
          } else {
            selection = null;
          }
        }
      }
      renderSelection();
      planView.redraw();
    } else if (e.type === 'move' && drag) {
      const current = drag;
      if (current.kind === 'ap') {
        const ap = plan.aps.find((a) => a.id === current.id);
        if (ap) {
          const point = snapPoint(e.x, e.y, true);
          ap.x = point.x;
          ap.y = point.y;
        }
      } else if (current.kind === 'endpoint') {
        const point = snapPoint(e.x, e.y, e.altKey);
        for (const { id, end } of current.ends) {
          const wall = plan.walls.find((w) => w.id === id);
          if (!wall) continue;
          if (end === 1) Object.assign(wall, { x1: point.x, y1: point.y });
          else Object.assign(wall, { x2: point.x, y2: point.y });
        }
      } else {
        const wall = plan.walls.find((w) => w.id === current.id);
        if (wall) {
          const dx = snap(e.x - current.fromX, SNAP_STEP_M);
          const dy = snap(e.y - current.fromY, SNAP_STEP_M);
          Object.assign(wall, {
            x1: current.original.x1 + dx,
            y1: current.original.y1 + dy,
            x2: current.original.x2 + dx,
            y2: current.original.y2 + dy,
          });
        }
      }
      heatmap = computeHeatmap(plan, band);
      paintHeat();
      planView.redraw();
    } else if (e.type === 'up' && drag) {
      drag = null;
      changed();
    }
  }

  function showReadout(e: PlanPointer) {
    if (e.x < 0 || e.y < 0 || e.x > plan.widthM || e.y > plan.heightM || plan.aps.length === 0 || drag) {
      readout.hide();
      return;
    }
    const f = WIFI_BANDS.find((b) => b.id === band)!.frequencyMHz;
    let best: { ap: AccessPoint; rssi: number; walls: number } | null = null;
    for (const ap of plan.aps) {
      const r = multiWallLossDb(ap.x, ap.y, e.x, e.y, plan.walls, band, f);
      const rssi = ap.powerDbm + ap.gainDbi - r.lossDb;
      if (!best || rssi > best.rssi) best = { ap, rssi, walls: r.wallsCrossed };
    }
    const quality = WIFI_THRESHOLDS.find((t) => best!.rssi >= t.dbm)?.label ?? 'sin servicio';
    readout.show(
      [
        `${meters(e.x)} · ${meters(e.y)}`,
        `${oneDecimal.format(best!.rssi)} dBm · ${quality}`,
        `Desde ${best!.ap.name}, ${integerFormat.format(best!.walls)} muro${best!.walls === 1 ? '' : 's'} en el camino`,
      ],
      e.sx,
      e.sy,
    );
  }

  // --- Panel ---

  function renderSelection() {
    if (selection?.kind !== 'wall') {
      selectionBox.hidden = true;
      return;
    }
    const wall = plan.walls.find((w) => w.id === selection!.id);
    if (!wall) {
      selectionBox.hidden = true;
      return;
    }
    selectionBox.hidden = false;
    selectionBox.innerHTML = `<h2>Muro seleccionado</h2><p class="hint">Largo ${meters(Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1))}.</p><div class="form" data-wall-form></div>
      <button type="button" class="button" data-delete-wall>Borrar este muro</button>`;
    selectionBox.querySelector<HTMLElement>('[data-wall-form]')!.append(
      createSelectField('Material', MATERIALS.map((m) => ({ id: m.id, label: `${m.label} (${m.lossDb[band]} dB)` })), wall.material, (id) => {
        snapshot();
        wall.material = id as MaterialId;
        changed();
      }).element,
    );
    selectionBox.querySelector('[data-delete-wall]')!.addEventListener('click', () => {
      snapshot();
      plan.walls = plan.walls.filter((w) => w.id !== wall.id);
      selection = null;
      changed();
    });
  }

  const AP_FIELDS: readonly NumberFieldSpec<'powerDbm' | 'gainDbi'>[] = [
    { key: 'powerDbm', label: 'Potencia', unit: 'dBm', min: -10, max: 36 },
    { key: 'gainDbi', label: 'Ganancia de antena', unit: 'dBi', min: -5, max: 20 },
  ];

  function renderAps() {
    if (plan.aps.length === 0) {
      apsBox.innerHTML = '<p class="hint">No hay access points. Usa la herramienta «Access point» para ubicar uno.</p>';
      return;
    }
    apsBox.replaceChildren(
      ...plan.aps.map((ap, i) => {
        const card = document.createElement('div');
        card.className = 'ap-card';
        if (selection?.kind === 'ap' && selection.id === ap.id) card.classList.add('selected');
        card.innerHTML = `
          <div class="ap-card-head">
            <span class="legend-swatch" style="background:${AP_COLORS[i % AP_COLORS.length]}"></span>
            <input type="text" aria-label="Nombre del access point" value="${ap.name.replace(/"/g, '&quot;')}" />
            <button type="button" class="link-button" data-remove>Borrar</button>
          </div>
          <div class="form"></div>`;
        const name = card.querySelector<HTMLInputElement>('input')!;
        name.addEventListener('change', () => {
          snapshot();
          ap.name = name.value.trim() || `AP ${i + 1}`;
          changed();
        });
        card.querySelector('[data-remove]')!.addEventListener('click', () => {
          snapshot();
          plan.aps = plan.aps.filter((a) => a.id !== ap.id);
          changed();
        });
        createFieldGroup(card.querySelector<HTMLElement>('.form')!, AP_FIELDS, { powerDbm: ap.powerDbm, gainDbi: ap.gainDbi }, (next) => {
          ap.powerDbm = next.powerDbm;
          ap.gainDbi = next.gainDbi;
          heatmap = computeHeatmap(plan, band);
          paintHeat();
          renderSummary();
          save({ plan, band });
          planView.redraw();
        });
        return card;
      }),
    );
  }

  function renderSummary() {
    if (!heatmap || plan.aps.length === 0) {
      summaryBox.innerHTML = '<p class="hint">Ubica al menos un access point para ver la señal.</p>';
      return;
    }
    const sorted = [...thresholds].sort((a, b) => b - a);
    const good = coverageFraction(heatmap, sorted[2] ?? -67);
    const usable = coverageFraction(heatmap, sorted[3] ?? -75);
    const none = 1 - coverageFraction(heatmap, sorted[sorted.length - 1] ?? -85);
    const advice =
      good >= 0.9
        ? 'El plano queda bien cubierto para voz y video.'
        : 'Para mejorar, acerca el access point al centro de las zonas naranja y roja, o agrega otro.';
    summaryBox.innerHTML = `
      <table class="budget"><tbody>
        <tr class="strong"><th scope="row">Área con ≥ ${sorted[2]} dBm (voz y video)</th><td>${integerFormat.format(good * 100)} %</td></tr>
        <tr><th scope="row">Área con ≥ ${sorted[3]} dBm (navegar)</th><td>${integerFormat.format(usable * 100)} %</td></tr>
        <tr><th scope="row">Sin servicio (&lt; ${sorted[sorted.length - 1]} dBm)</th><td>${integerFormat.format(none * 100)} %</td></tr>
        <tr><th scope="row">Plano</th><td>${meters(plan.widthM)} × ${meters(plan.heightM)}, ${plan.walls.length} muros</td></tr>
      </tbody></table>
      <p class="hint">${advice}</p>`;
  }

  function renderMaterials() {
    materialsBox.innerHTML = `
      <table class="budget"><thead><tr><th></th>${WIFI_BANDS.map((b) => `<th>${b.label}</th>`).join('')}</tr></thead><tbody>
      ${MATERIALS.map((m) => `<tr><th scope="row"><span class="legend-swatch" style="background:${m.color}"></span>${m.label}</th>${WIFI_BANDS.map((b) => `<td>${m.lossDb[b.id]} dB</td>`).join('')}</tr>`).join('')}
      </tbody></table>
      <p class="hint">Valores típicos (ITU-R P.2040 y guías de diseño WiFi). Varían con el grosor y la humedad del muro.</p>`;
  }

  // --- Controles ---

  const sizeFields = createFieldGroup(
    find('[data-size]'),
    [
      { key: 'widthM', label: 'Ancho del plano', unit: 'm', min: 2, max: 300 },
      { key: 'heightM', label: 'Largo del plano', unit: 'm', min: 2, max: 300 },
    ] as const,
    { widthM: plan.widthM, heightM: plan.heightM },
    (next) => {
      snapshot();
      plan.widthM = next.widthM;
      plan.heightM = next.heightM;
      changed();
      planView.fit();
    },
  );

  find('[data-material]').append(
    createSelectField('Material del muro nuevo', MATERIALS.map((m) => ({ id: m.id, label: m.label })), newMaterial, (id) => {
      newMaterial = id as MaterialId;
    }).element,
  );

  const setTool = (id: Tool) => {
    tool = id;
    drawingFrom = null;
    toolHint.textContent = TOOLS.find((t) => t.id === id)!.hint;
    find('[data-material]').hidden = id !== 'wall';
    planView.redraw();
  };
  const toolControl = bindSegmented(panel, 'herramienta', tool, (id) => setTool(id as Tool));

  const bandControl = bindSegmented(panel, 'banda', band, (id) => {
    band = id as WifiBand;
    renderMaterials();
    changed();
  });

  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-preset]')) {
    button.addEventListener('click', () => {
      snapshot();
      plan = PLAN_PRESETS.find((p) => p.id === button.dataset.preset)!.build();
      selection = null;
      readout.hide();
      sizeFields.setValues({ widthM: plan.widthM, heightM: plan.heightM });
      replaceQuery('plano', button.dataset.preset!);
      changed();
      planView.fit();
    });
  }

  const currentProject = (): IndoorProject => ({ plan, band, thresholds });

  /** Pone en la página un proyecto abierto de un archivo (o el anterior, al deshacer). */
  function applyProject(data: IndoorProject) {
    plan = data.plan;
    band = data.band;
    thresholds = data.thresholds;
    selection = null;
    drawingFrom = null;
    readout.hide();
    bandControl.set(band);
    sizeFields.setValues({ widthM: plan.widthM, heightM: plan.heightM });
    // Sin «?plano=…» en la dirección, al recargar se ve este proyecto y no el plano de ejemplo.
    replaceQuery('plano', null);
    renderMaterials();
    changed();
    planView.fit();
  }

  bindProjectButtons(panel, {
    scenario: 'interiores',
    collect: currentProject,
    read: readIndoorProject,
    apply(data) {
      pushUndo({ project: currentProject() });
      applyProject(data);
    },
  });

  function undo() {
    const previous = undoStack.pop();
    if (!previous) return;
    const entry = JSON.parse(previous) as UndoEntry;
    if ('project' in entry) return applyProject(entry.project);
    plan = entry.plan;
    selection = null;
    sizeFields.setValues({ widthM: plan.widthM, heightM: plan.heightM });
    changed();
  }
  find('[data-undo]').addEventListener('click', undo);
  find('[data-fit]').addEventListener('click', () => planView.fit());

  const onKey = (event: KeyboardEvent) => {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement;
    if (typing) return;
    if (event.key === 'Escape') {
      drawingFrom = null;
      selection = null;
      renderSelection();
      planView.redraw();
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
      snapshot();
      if (selection.kind === 'wall') plan.walls = plan.walls.filter((w) => w.id !== selection!.id);
      else plan.aps = plan.aps.filter((a) => a.id !== selection!.id);
      selection = null;
      changed();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    } else if (event.key === 'Shift') {
      shiftHeld = true;
      planView.redraw();
    }
  };
  window.addEventListener('keydown', onKey);

  const planView = createPlanView(find('.plan-host'), {
    bounds: () => ({ minX: 0, minY: 0, maxX: plan.widthM, maxY: plan.heightM }),
    draw,
    onPointer,
  });

  setTool('select');
  toolControl.set('select');
  renderMaterials();
  changed();

  return () => {
    window.removeEventListener('keydown', onKey);
    planView.destroy();
  };
}
