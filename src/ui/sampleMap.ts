// Carta topográfica ilustrativa (relieve y franjas de señal de un sitio de muestra) para las
// portadas. Es un dibujo, no una simulación.

/** Contorno cerrado irregular alrededor de (cx, cy): una curva de nivel o de señal de muestra. */
function contour(cx: number, cy: number, radius: number, phase: number, detail: number): string {
  const steps = 120;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const g =
      1 +
      0.2 * Math.sin(t + 0.6 * phase) +
      0.16 * Math.sin(2 * t + 1.7 * phase) +
      0.1 * Math.sin(3 * t + phase) +
      detail * (0.07 * Math.sin(5 * t + 2.3 * phase) + 0.05 * Math.sin(9 * t + 2 * phase) + 0.03 * Math.sin(17 * t + 3 * phase));
    d += `${i === 0 ? 'M' : 'L'}${(cx + radius * g * Math.cos(t)).toFixed(1)} ${(cy + radius * g * Math.sin(t)).toFixed(1)}`;
  }
  return `${d}Z`;
}

/** SVG de la carta de muestra; llena su contenedor. */
export function sampleCoverageMap(): string {
  const topo: string[] = [];
  const index: string[] = [];
  const hills: [number, number, number, number][] = [
    [300, 236, 0.4, 12],
    [500, 90, 2.1, 7],
    [90, 380, 1.4, 8],
    [520, 420, 2.9, 6],
  ];
  for (const [x, y, phase, count] of hills) {
    for (let i = 1; i <= count; i++) (i % 4 === 0 ? index : topo).push(contour(x, y, 16 * i, phase + i * 0.09, 1.5));
  }
  const bands = [
    { r: 215, k: 1, fill: '#d73027', opacity: 0.5, stroke: '#a3201a' },
    { r: 158, k: 1.2, fill: '#f6d32d', opacity: 0.6, stroke: '#b89a10' },
    { r: 104, k: 1.4, fill: '#91cf60', opacity: 0.65, stroke: '#5f9a35' },
    { r: 52, k: 1.6, fill: '#1a9850', opacity: 0.7, stroke: '#106a37' },
  ];
  return `
    <svg viewBox="0 0 606 470" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="${topo.join('')}" fill="none" stroke="#cdbfa0" stroke-width="0.9"/>
      <path d="${index.join('')}" fill="none" stroke="#b8a67f" stroke-width="1.5"/>
      <path d="M120 0C100 90 150 170 118 250S80 380 150 470" fill="none" stroke="#6f97b8" stroke-width="2.2"/>
      ${bands
        .map(
          (b, i) =>
            `<path d="${contour(303, 240, b.r, 1.3 + i * 0.02, b.k)}" fill="${b.fill}" fill-opacity="${b.opacity}" stroke="${b.stroke}"/>`,
        )
        .join('')}
      <circle cx="303" cy="240" r="7" fill="#fbfaf6" stroke="#1f2328" stroke-width="2"/>
      <path d="M560 34 568 54 560 49 552 54Z" fill="#1f2328"/>
      <text x="556" y="28" class="hero-map-label">N</text>
    </svg>`;
}

/** Leyenda de la carta de muestra, con los mismos umbrales del simulador. */
export const SAMPLE_MAP_KEY = `
  <i style="background:#1a9850"></i>≥ −80 <i style="background:#91cf60"></i>−95
  <i style="background:#f6d32d"></i>−105 <i style="background:#d73027"></i>−116 dBm`;
