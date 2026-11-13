// Datos de /interiores para el enlace de "Compartir": el mismo proyecto que guarda "Guardar
// proyecto" (plano, banda, umbrales, potencia del cliente y ancho de canal) y revisado con el
// mismo lector, así un plano compartido pasa las mismas revisiones que un archivo .json. Las
// medidas van al centímetro para que el enlace sea más corto. Módulo puro.

import { isRecord } from '../../export/projectFile';
import { readIndoorProject, type IndoorProject } from '../../indoor/project';

/** Al centímetro: los muros se ajustan cada 25 cm y un AP arrastrado trae decimales que no cambian nada. */
const cm = (v: number) => Math.round(v * 100) / 100;

/** p: el proyecto, con las medidas del plano al centímetro. */
export function indoorShareData(project: IndoorProject): Record<string, unknown> {
  const { plan } = project;
  return {
    p: {
      ...project,
      plan: {
        ...plan,
        widthM: cm(plan.widthM),
        heightM: cm(plan.heightM),
        walls: plan.walls.map((w) => ({ ...w, x1: cm(w.x1), y1: cm(w.y1), x2: cm(w.x2), y2: cm(w.y2) })),
        aps: plan.aps.map((a) => ({ ...a, x: cm(a.x), y: cm(a.y) })),
      },
    },
  };
}

/** El proyecto del enlace; null si algo no sirve (la página abre con el plano que tenía). */
export function readIndoorShare(data: unknown): IndoorProject | null {
  return isRecord(data) ? readIndoorProject(data.p) : null;
}
