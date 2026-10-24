// Mensajes entre el hilo principal y los hilos de cálculo de cobertura.

import type { EngineSpec } from '../propagation/engines';
import type { LinkGeometry } from './inputs';

/** Una tanda de radiales consecutivos para un hilo de cálculo. */
export interface CoverageJob {
  jobId: number;
  engine: EngineSpec;
  /** Cotas de todos los radiales de la tanda, uno detrás de otro. */
  profiles: Float32Array;
  radialCount: number;
  samplesPerRadial: number;
  stepM: number;
  stride: number;
  /** Trayectos a calcular sobre los mismos perfiles (por ejemplo bajada y subida). */
  links: LinkGeometry[];
}

export type CoverageJobReply =
  | {
      type: 'result';
      jobId: number;
      /** Por trayecto: pérdidas (dB) de todos los radiales de la tanda, uno detrás de otro. */
      lossDb: Float32Array[];
      /** Por trayecto: banderas de advertencia del motor, en el mismo orden. */
      warnings: Int32Array[];
    }
  | { type: 'error'; jobId: number; message: string };
