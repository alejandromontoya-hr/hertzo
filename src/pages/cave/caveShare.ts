// Datos de /cavernas para el enlace de "Compartir": el mismo proyecto que guarda "Guardar
// proyecto" (galerías, antenas, cable radiante, banda, roca, radio y umbrales) y revisado con el
// mismo lector, así una red compartida pasa las mismas revisiones que un archivo .json. Las
// coordenadas van al centímetro para que el enlace sea más corto. Módulo puro.

import type { Point } from '../../cave/network';
import { readCaveProject, type CaveProject } from '../../cave/project';
import { isRecord } from '../../export/projectFile';

/** Al centímetro: en galerías de varios metros de ancho, más decimales no cambian nada. */
const cm = (v: number) => Math.round(v * 100) / 100;
const cmPoints = (points: Point[]) => points.map((p) => ({ x: cm(p.x), y: cm(p.y) }));

/** p: el proyecto, con las coordenadas al centímetro. */
export function caveShareData(project: CaveProject): Record<string, unknown> {
  const { model } = project;
  return {
    p: {
      ...project,
      model: {
        galleries: model.galleries.map((g) => ({ ...g, points: cmPoints(g.points) })),
        transmitters: model.transmitters.map((t) => ({ ...t, x: cm(t.x), y: cm(t.y) })),
        cables: model.cables.map((c) => ({ ...c, points: cmPoints(c.points) })),
      },
    },
  };
}

/** El proyecto del enlace; null si algo no sirve (la página abre con la red que tenía). */
export function readCaveShare(data: unknown): CaveProject | null {
  return isRecord(data) ? readCaveProject(data.p) : null;
}
