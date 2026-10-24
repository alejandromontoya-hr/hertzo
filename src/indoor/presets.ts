// Planos de ejemplo para interiores: casa, apartamento y oficina.

import type { MaterialId } from '../rf/indoor';
import type { AccessPoint, FloorPlan, Wall } from './plan';

let n = 0;
const wall = (x1: number, y1: number, x2: number, y2: number, material: MaterialId): Wall => ({
  id: `w${++n}`,
  x1,
  y1,
  x2,
  y2,
  material,
});

/** Muro recto con huecos o tramos de otro material: [desde, hasta, material] a lo largo del muro. */
function run(
  axis: 'h' | 'v',
  fixed: number,
  pieces: readonly [number, number, MaterialId | null][],
): Wall[] {
  return pieces
    .filter(([, , material]) => material !== null)
    .map(([from, to, material]) =>
      axis === 'h' ? wall(from, fixed, to, fixed, material!) : wall(fixed, from, fixed, to, material!),
    );
}

const ap = (id: string, name: string, x: number, y: number, powerDbm = 20, gainDbi = 3): AccessPoint => ({
  id,
  name,
  x,
  y,
  powerDbm,
  gainDbi,
});

/** Casa de un piso de 12 × 9 m: fachada de ladrillo con ventanas, muro central de ladrillo y alcobas en drywall. */
function house(): FloorPlan {
  return {
    widthM: 12,
    heightM: 9,
    walls: [
      ...run('h', 0, [[0, 2, 'ladrillo'], [2, 4, 'vidrio'], [4, 8, 'ladrillo'], [8, 10, 'vidrio'], [10, 12, 'ladrillo']]),
      ...run('h', 9, [[0, 1, 'ladrillo'], [1, 2, 'madera'], [2, 7, 'ladrillo'], [7, 9, 'vidrio'], [9, 12, 'ladrillo']]),
      ...run('v', 0, [[0, 3, 'ladrillo'], [3, 5, 'vidrio'], [5, 9, 'ladrillo']]),
      ...run('v', 12, [[0, 1.5, 'ladrillo'], [1.5, 3, 'vidrio'], [3, 6, 'ladrillo'], [6, 7.5, 'vidrio'], [7.5, 9, 'ladrillo']]),
      // Muro central de ladrillo con puerta de madera hacia las alcobas.
      ...run('v', 6, [[0, 3.6, 'ladrillo'], [3.6, 4.5, 'madera'], [4.5, 9, 'ladrillo']]),
      // Alcobas en drywall, cada una con su puerta.
      ...run('h', 3, [[6, 6.4, 'drywall'], [6.4, 7.3, 'madera'], [7.3, 12, 'drywall']]),
      ...run('h', 6, [[6, 6.4, 'drywall'], [6.4, 7.3, 'madera'], [7.3, 12, 'drywall']]),
      // Baño en ladrillo y nevera metálica en la cocina.
      ...run('v', 3, [[6, 9, 'ladrillo']]),
      ...run('h', 6, [[0, 2, 'ladrillo'], [2, 2.8, 'madera'], [2.8, 3, 'ladrillo']]),
      wall(4.2, 0.4, 5.0, 0.4, 'metal'),
    ],
    aps: [ap('ap1', 'Router de la sala', 2.5, 4.2)],
  };
}

/** Apartamento de 10 × 7 m: estructura de concreto, fachada de vidrio y router junto a la entrada. */
function apartment(): FloorPlan {
  return {
    widthM: 10,
    heightM: 7,
    walls: [
      ...run('h', 0, [[0, 1.2, 'concreto'], [1.2, 2.1, 'madera'], [2.1, 10, 'concreto']]),
      ...run('h', 7, [[0, 1, 'concreto'], [1, 6, 'vidrio'], [6, 10, 'concreto']]),
      ...run('v', 0, [[0, 7, 'concreto']]),
      ...run('v', 10, [[0, 2, 'concreto'], [2, 3.5, 'vidrio'], [3.5, 7, 'concreto']]),
      // Columna-muro de carga en concreto entre sala y alcobas.
      ...run('v', 6, [[0, 2.2, 'concreto'], [2.2, 3.1, 'madera'], [3.1, 7, 'concreto']]),
      ...run('h', 3.5, [[6, 6.5, 'drywall'], [6.5, 7.4, 'madera'], [7.4, 10, 'drywall']]),
      // Baño y cocina.
      ...run('v', 3, [[0, 2.5, 'drywall']]),
      ...run('h', 2.5, [[0, 2, 'drywall'], [2, 2.8, 'madera'], [2.8, 3, 'drywall']]),
      wall(3.4, 0.3, 4.2, 0.3, 'metal'),
    ],
    aps: [ap('ap1', 'Router del operador', 1.6, 0.6)],
  };
}

/** Oficina de 24 × 14 m: fachada de vidrio, núcleo de concreto con ascensor y salas de reunión en vidrio. */
function office(): FloorPlan {
  return {
    widthM: 24,
    heightM: 14,
    walls: [
      ...run('h', 0, [[0, 24, 'concreto']]),
      ...run('h', 14, [[0, 24, 'vidrio']]),
      ...run('v', 0, [[0, 14, 'concreto']]),
      ...run('v', 24, [[0, 14, 'vidrio']]),
      // Núcleo: escaleras en concreto y ascensor metálico.
      ...run('h', 4, [[10, 14, 'concreto']]),
      ...run('v', 10, [[0, 4, 'concreto']]),
      ...run('v', 14, [[0, 2.5, 'concreto'], [2.5, 4, 'metal']]),
      ...run('v', 12, [[0, 4, 'concreto']]),
      // Salas de reunión con frente de vidrio.
      ...run('h', 5, [[0, 3, 'drywall'], [3, 4, 'madera'], [4, 8, 'vidrio']]),
      ...run('v', 8, [[0, 5, 'drywall']]),
      ...run('v', 4, [[0, 5, 'drywall']]),
      ...run('h', 9, [[18, 19, 'madera'], [19, 24, 'vidrio']]),
      ...run('v', 18, [[9, 14, 'drywall']]),
      // Cuarto técnico con gabinete metálico.
      ...run('h', 4, [[18, 24, 'bloque']]),
      ...run('v', 18, [[0, 3, 'bloque'], [3, 4, 'madera']]),
      wall(20, 1, 22, 1, 'metal'),
    ],
    aps: [ap('ap1', 'AP zona abierta oeste', 5, 9.5, 20, 4), ap('ap2', 'AP zona abierta este', 16, 7, 20, 4)],
  };
}

export const PLAN_PRESETS: readonly { id: string; label: string; build: () => FloorPlan }[] = [
  { id: 'casa', label: 'Casa', build: house },
  { id: 'apartamento', label: 'Apartamento', build: apartment },
  { id: 'oficina', label: 'Oficina', build: office },
  { id: 'blanco', label: 'En blanco', build: () => ({ widthM: 15, heightM: 10, walls: [], aps: [] }) },
];
