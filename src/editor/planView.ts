// Vista de plano 2D en metros sobre un lienzo: ajuste al tamaño, zoom con la rueda,
// desplazamiento con el botón derecho o central, grilla y barra de escala.
// La usan los editores de interiores y de cavernas; cada uno dibuja lo suyo encima.

export interface PlanPointer {
  type: 'down' | 'move' | 'up' | 'leave' | 'dblclick';
  /** Posición en metros. */
  x: number;
  y: number;
  /** Posición en píxeles dentro del lienzo. */
  sx: number;
  sy: number;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
}

export interface PlanView {
  canvas: HTMLCanvasElement;
  /** Píxeles por metro. */
  scale(): number;
  toScreen(x: number, y: number): [number, number];
  toWorld(sx: number, sy: number): [number, number];
  redraw(): void;
  /** Encuadra todo el plano. */
  fit(): void;
  destroy(): void;
}

export interface PlanViewOptions {
  /** Rectángulo del mundo a encuadrar (m). */
  bounds(): { minX: number; minY: number; maxX: number; maxY: number };
  /** Dibuja el contenido; el contexto ya está en píxeles de pantalla (con devicePixelRatio). */
  draw(ctx: CanvasRenderingContext2D, view: PlanView): void;
  onPointer(event: PlanPointer): void;
  /** Muestra la grilla en metros (por omisión sí). */
  grid?: boolean;
}

const FIT_MARGIN_PX = 28;

/** Paso de grilla «redondo» (1, 2 o 5 por potencia de 10) para que las líneas queden a ≥ 18 px. */
export function gridStepM(pixelsPerMeter: number): number {
  const target = 18 / pixelsPerMeter;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= target)!;
}

export function createPlanView(container: HTMLElement, options: PlanViewOptions): PlanView {
  const canvas = document.createElement('canvas');
  canvas.className = 'plan-canvas';
  container.append(canvas);
  const ctx = canvas.getContext('2d')!;

  let pxPerM = 10;
  let offsetX = 0; // pantalla = mundo · pxPerM + offset
  let offsetY = 0;
  let cssWidth = 0;
  let cssHeight = 0;
  let fitted = false;
  let panning: { sx: number; sy: number; ox: number; oy: number } | null = null;
  let frame = 0;

  const view: PlanView = {
    canvas,
    scale: () => pxPerM,
    toScreen: (x, y) => [x * pxPerM + offsetX, y * pxPerM + offsetY],
    toWorld: (sx, sy) => [(sx - offsetX) / pxPerM, (sy - offsetY) / pxPerM],
    redraw() {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paint();
      });
    },
    fit() {
      const b = options.bounds();
      const w = Math.max(1, b.maxX - b.minX);
      const h = Math.max(1, b.maxY - b.minY);
      pxPerM = Math.max(0.01, Math.min((cssWidth - 2 * FIT_MARGIN_PX) / w, (cssHeight - 2 * FIT_MARGIN_PX) / h));
      offsetX = (cssWidth - w * pxPerM) / 2 - b.minX * pxPerM;
      offsetY = (cssHeight - h * pxPerM) / 2 - b.minY * pxPerM;
      view.redraw();
    },
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
      canvas.remove();
    },
  };

  function drawGrid() {
    const step = gridStepM(pxPerM);
    const [x0, y0] = view.toWorld(0, 0);
    const [x1, y1] = view.toWorld(cssWidth, cssHeight);
    ctx.lineWidth = 1;
    for (let gx = Math.floor(x0 / step) * step; gx <= x1; gx += step) {
      const major = Math.abs(gx / (step * 5) - Math.round(gx / (step * 5))) < 1e-6;
      ctx.strokeStyle = major ? 'rgba(27,31,36,0.12)' : 'rgba(27,31,36,0.05)';
      const sx = Math.round(gx * pxPerM + offsetX) + 0.5;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, cssHeight);
      ctx.stroke();
    }
    for (let gy = Math.floor(y0 / step) * step; gy <= y1; gy += step) {
      const major = Math.abs(gy / (step * 5) - Math.round(gy / (step * 5))) < 1e-6;
      ctx.strokeStyle = major ? 'rgba(27,31,36,0.12)' : 'rgba(27,31,36,0.05)';
      const sy = Math.round(gy * pxPerM + offsetY) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(cssWidth, sy);
      ctx.stroke();
    }
  }

  function drawScaleBar() {
    const meters = gridStepM(pxPerM) * 5;
    const length = meters * pxPerM;
    const x = 12;
    const y = cssHeight - 14;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x - 4, y - 16, length + 8 + 50, 22);
    ctx.strokeStyle = '#1f2328';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y);
    ctx.lineTo(x + length, y);
    ctx.lineTo(x + length, y - 4);
    ctx.stroke();
    ctx.fillStyle = '#1f2328';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(meters >= 1000 ? `${meters / 1000} km` : `${meters} m`, x + length + 6, y);
  }

  function paint() {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = '#f6f7f9';
    ctx.fillRect(0, 0, cssWidth, cssHeight);
    if (options.grid !== false) drawGrid();
    options.draw(ctx, view);
    drawScaleBar();
  }

  const observer = new ResizeObserver(() => {
    const rect = container.getBoundingClientRect();
    cssWidth = rect.width;
    cssHeight = rect.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    if (!fitted && cssWidth > 0 && cssHeight > 0) {
      fitted = true;
      view.fit();
    } else {
      view.redraw();
    }
  });
  observer.observe(container);

  const pointer = (type: PlanPointer['type'], event: PointerEvent | MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    const [x, y] = view.toWorld(sx, sy);
    options.onPointer({ type, x, y, sx, sy, button: event.button, shiftKey: event.shiftKey, altKey: event.altKey });
  };

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || event.button === 2) {
      panning = { sx: event.clientX, sy: event.clientY, ox: offsetX, oy: offsetY };
      return;
    }
    pointer('down', event);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (panning) {
      offsetX = panning.ox + event.clientX - panning.sx;
      offsetY = panning.oy + event.clientY - panning.sy;
      view.redraw();
      return;
    }
    pointer('move', event);
  });
  canvas.addEventListener('pointerup', (event) => {
    if (panning) {
      panning = null;
      return;
    }
    pointer('up', event);
  });
  canvas.addEventListener('pointerleave', (event) => pointer('leave', event));
  canvas.addEventListener('dblclick', (event) => pointer('dblclick', event));
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = event.clientX - rect.left;
      const sy = event.clientY - rect.top;
      const [wx, wy] = view.toWorld(sx, sy);
      pxPerM = Math.min(2000, Math.max(0.01, pxPerM * Math.exp(-event.deltaY * 0.0015)));
      offsetX = sx - wx * pxPerM;
      offsetY = sy - wy * pxPerM;
      view.redraw();
    },
    { passive: false },
  );

  return view;
}
