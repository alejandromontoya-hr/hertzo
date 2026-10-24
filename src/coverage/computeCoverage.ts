// Cálculo de cobertura de un sitio: descarga el terreno (si el motor lo usa), reparte los
// radiales entre hilos de cálculo y junta una grilla de pérdidas por cada trayecto pedido.

import type { LonLat } from '../geo/geodesy';
import { engineNeedsTerrain, type EngineSpec } from '../propagation/engines';
import { loadTerrain } from '../terrain/elevation';
import type { TerrainSampler } from '../terrain/sampler';
import type { LinkGeometry } from './inputs';
import type { CoverageJob, CoverageJobReply } from './protocol';
import { circleBounds, planRadials, sampleRadial, type PlanOptions, type RadialPlan } from './radials';

/** Radiales por tanda: suficientes para que repartir no cueste más que calcular. */
const RADIALS_PER_JOB = 24;

/** Lo que hace falta para calcular: sitio, radio, trayectos, motor y resolución. */
export interface CoverageRequest {
  site: LonLat;
  radiusM: number;
  /** Trayectos sobre los mismos perfiles (por ejemplo bajada y subida). */
  links: LinkGeometry[];
  engine: EngineSpec;
  plan?: PlanOptions;
}

export function sameRequest(a: CoverageRequest | null, b: CoverageRequest): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}

/** Pérdidas de un trayecto: una fila por radial, `pointsPerRadial` columnas. */
export interface CoverageGrid {
  lossDb: Float32Array;
  /** Banderas de advertencia del motor en cada punto (0 = ninguna). */
  warnings: Int32Array;
}

export interface CoverageResult {
  request: CoverageRequest;
  plan: RadialPlan;
  /** Una grilla por trayecto, en el mismo orden de `request.links`. */
  grids: CoverageGrid[];
  elapsedMs: number;
}

export type CoverageProgress =
  | { phase: 'terrain'; done: number; total: number }
  | { phase: 'radials'; done: number; total: number };

export class CoverageAbortedError extends Error {
  constructor() {
    super('Cálculo cancelado.');
    this.name = 'CoverageAbortedError';
  }
}

function defaultWorkerCount(): number {
  // Se deja un núcleo libre para el mapa y la interfaz.
  return Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
}

/** Terreno plano a 0 m para los motores que no usan el perfil. */
const flatSampler: TerrainSampler = { zoom: 0, heightAt: () => 0 };

/** Grupo de hilos de cálculo que se crea una vez y se reutiliza en cada cálculo. */
export class CoverageRunner {
  private readonly workers: Worker[];
  private nextJobId = 0;

  constructor(workerCount = defaultWorkerCount()) {
    this.workers = Array.from(
      { length: workerCount },
      () => new Worker(new URL('./coverage.worker.ts', import.meta.url), { type: 'module' }),
    );
  }

  get workerCount(): number {
    return this.workers.length;
  }

  async run(
    request: CoverageRequest,
    onProgress: (progress: CoverageProgress) => void,
    signal: AbortSignal,
  ): Promise<CoverageResult> {
    const started = performance.now();
    const plan = planRadials(request.site, request.radiusM, request.plan);

    const needsTerrain = engineNeedsTerrain(request.engine);
    const sampler = needsTerrain
      ? await loadTerrain(circleBounds(request.site, request.radiusM), undefined, (done, total) =>
          onProgress({ phase: 'terrain', done, total }),
        )
      : flatSampler;
    if (signal.aborted) throw new CoverageAbortedError();

    const size = plan.radialCount * plan.pointsPerRadial;
    const grids: CoverageGrid[] = request.links.map(() => ({
      lossDb: new Float32Array(size),
      warnings: new Int32Array(size),
    }));

    await this.dispatch(
      plan,
      needsTerrain ? sampler : null,
      request,
      signal,
      (firstRadial, reply) => {
        const offset = firstRadial * plan.pointsPerRadial;
        grids.forEach((grid, l) => {
          grid.lossDb.set(reply.lossDb[l]!, offset);
          grid.warnings.set(reply.warnings[l]!, offset);
        });
      },
      (done) => onProgress({ phase: 'radials', done, total: plan.radialCount }),
    );

    return { request, plan, grids, elapsedMs: performance.now() - started };
  }

  /**
   * Reparte tandas de radiales: cada hilo recibe una nueva en cuanto entrega la anterior.
   * Los perfiles de cada tanda se muestrean justo antes de enviarla, mientras los demás
   * hilos calculan. Sin `sampler` (motores sin terreno) se envía un perfil plano.
   */
  private dispatch(
    plan: RadialPlan,
    sampler: TerrainSampler | null,
    request: CoverageRequest,
    signal: AbortSignal,
    onResult: (firstRadial: number, reply: Extract<CoverageJobReply, { type: 'result' }>) => void,
    onProgress: (radialsDone: number) => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let nextRadial = 0;
      let radialsDone = 0;
      let finished = false;
      const pending = new Map<number, number>(); // jobId → primer radial

      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        for (const worker of this.workers) {
          worker.onmessage = null;
          worker.onerror = null;
        }
        signal.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else resolve();
      };
      const onAbort = () => finish(new CoverageAbortedError());
      signal.addEventListener('abort', onAbort);

      const sendNext = (worker: Worker) => {
        if (finished || nextRadial >= plan.radialCount) return;
        const firstRadial = nextRadial;
        const radialCount = Math.min(RADIALS_PER_JOB, plan.radialCount - firstRadial);
        nextRadial += radialCount;
        const profiles = new Float32Array(radialCount * plan.samplesPerRadial);
        if (sampler) {
          for (let r = 0; r < radialCount; r++) {
            sampleRadial(
              sampler,
              plan,
              firstRadial + r,
              profiles.subarray(r * plan.samplesPerRadial, (r + 1) * plan.samplesPerRadial),
            );
          }
        }
        const jobId = ++this.nextJobId;
        pending.set(jobId, firstRadial);
        const job: CoverageJob = {
          jobId,
          engine: request.engine,
          profiles,
          radialCount,
          samplesPerRadial: plan.samplesPerRadial,
          stepM: plan.stepM,
          stride: plan.stride,
          links: request.links,
        };
        worker.postMessage(job, [profiles.buffer]);
      };

      for (const worker of this.workers) {
        worker.onerror = (event) => finish(new Error(`Falló un hilo de cálculo: ${event.message}`));
        worker.onmessage = (event: MessageEvent<CoverageJobReply>) => {
          const reply = event.data;
          const firstRadial = pending.get(reply.jobId);
          if (firstRadial === undefined || finished) return; // respuesta de un cálculo anterior
          pending.delete(reply.jobId);
          if (reply.type === 'error') {
            finish(new Error(reply.message));
            return;
          }
          onResult(firstRadial, reply);
          radialsDone += reply.lossDb[0]!.length / plan.pointsPerRadial;
          onProgress(radialsDone);
          if (radialsDone >= plan.radialCount) finish();
          else sendNext(worker);
        };
      }

      if (signal.aborted) {
        onAbort();
        return;
      }
      for (const worker of this.workers) sendNext(worker);
    });
  }
}

let sharedRunner: CoverageRunner | undefined;

/** Hilos de cálculo compartidos por todas las páginas (se crean al primer uso). */
export function getCoverageRunner(): CoverageRunner {
  sharedRunner ??= new CoverageRunner();
  return sharedRunner;
}
