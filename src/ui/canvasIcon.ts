// Dibuja un ícono de Lucide en un lienzo (los planos de Interiores y Cavernas), con el mismo
// trazo que en el resto de la página. Lucide solo usa path, rect, circle y line.

const number = (attrs: string, name: string) => Number(new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1] ?? 0);

/** Cada figura del SVG como el texto "d" de un trazo, en la grilla de 24 × 24 del ícono. */
export function iconPaths(svg: string): string[] {
  const paths: string[] = [];
  for (const [, tag, attrs] of svg.matchAll(/<(path|rect|circle|line)\s([^>]*?)\/?>/g)) {
    if (tag === 'path') {
      paths.push(/(?:^|\s)d="([^"]*)"/.exec(attrs!)?.[1] ?? '');
    } else if (tag === 'rect') {
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((n) => number(attrs!, n)) as [number, number, number, number];
      const r = Math.min(number(attrs!, 'rx'), w / 2, h / 2);
      paths.push(
        `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}` +
          `h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`,
      );
    } else if (tag === 'circle') {
      const [cx, cy, r] = ['cx', 'cy', 'r'].map((n) => number(attrs!, n)) as [number, number, number];
      paths.push(`M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`);
    } else {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((n) => number(attrs!, n));
      paths.push(`M${x1} ${y1}L${x2} ${y2}`);
    }
  }
  return paths.filter((d) => d !== '');
}

const cache = new Map<string, Path2D[]>();

/** Dibuja el ícono centrado en (cx, cy), de `size` píxeles de lado, con trazo del color dado. */
export function drawIcon(ctx: CanvasRenderingContext2D, svg: string, cx: number, cy: number, size: number, color: string) {
  let paths = cache.get(svg);
  if (!paths) {
    paths = iconPaths(svg).map((d) => new Path2D(d));
    cache.set(svg, paths);
  }
  const scale = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  // Trazo de 2 en la grilla del ícono, como en el HTML; no cambia con el aumento del plano.
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const p of paths) ctx.stroke(p);
  ctx.restore();
}
