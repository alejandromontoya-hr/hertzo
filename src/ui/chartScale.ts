/**
 * Marcas "redondas" para un eje: pasos de 1, 2 o 5 por una potencia de 10.
 * De 1234 a 3086 m con 5 marcas como máximo: 1500, 2000, 2500, 3000.
 */
export function niceTicks(min: number, max: number, maxCount: number): number[] {
  if (!(max > min)) return [min];
  const rough = (max - min) / maxCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rough)!;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
    ticks.push(Math.round(v / step) * step);
  }
  return ticks;
}
