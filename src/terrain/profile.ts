// Perfil de terreno entre dos puntos, con muestras equiespaciadas. Módulo puro.

import { destinationPoint, distanceM, initialBearingDeg, type LonLat } from '../geo/geodesy';
import type { TerrainSampler } from './sampler';
import type { Bounds } from './tiles';

/** Paso del perfil (m). El píxel de terreno en zoom 12 mide unos 38 m en Antioquia. */
export const PROFILE_STEP_M = 30;

export interface TerrainProfile {
  from: LonLat;
  to: LonLat;
  distanceM: number;
  /** Separación real entre muestras (m), igual o menor que la pedida. */
  stepM: number;
  /** Distancia de cada muestra al punto de partida (m). */
  distancesM: Float64Array;
  /** Cota del terreno en cada muestra (m). */
  elevationsM: Float32Array;
}

/** Rectángulo que contiene los dos extremos del perfil. */
export function profileBounds(a: LonLat, b: LonLat): Bounds {
  return {
    west: Math.min(a.lon, b.lon),
    south: Math.min(a.lat, b.lat),
    east: Math.max(a.lon, b.lon),
    north: Math.max(a.lat, b.lat),
  };
}

/** Muestrea el terreno de `from` a `to`, incluidos los dos extremos. */
export function sampleProfile(
  sampler: TerrainSampler,
  from: LonLat,
  to: LonLat,
  maxStepM = PROFILE_STEP_M,
): TerrainProfile {
  const total = distanceM(from, to);
  const intervals = Math.max(1, Math.ceil(total / maxStepM));
  const stepM = total / intervals;
  const bearing = initialBearingDeg(from, to);
  const distancesM = new Float64Array(intervals + 1);
  const elevationsM = new Float32Array(intervals + 1);
  for (let i = 0; i <= intervals; i++) {
    const point = i === intervals ? to : destinationPoint(from, bearing, i * stepM);
    distancesM[i] = i * stepM;
    elevationsM[i] = sampler.heightAt(point.lon, point.lat);
  }
  return { from, to, distanceM: total, stepM, distancesM, elevationsM };
}

/** Punto del perfil a una distancia dada del inicio (para señalarlo en el mapa). */
export function pointAtDistance(profile: TerrainProfile, distance: number): LonLat {
  return destinationPoint(profile.from, initialBearingDeg(profile.from, profile.to), distance);
}
