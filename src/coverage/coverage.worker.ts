// Hilo de cálculo de cobertura: corre el motor de propagación pedido sobre tandas de radiales.

import type { PropagationEngine } from '../propagation/engine';
import { createEngine } from '../propagation/engines';
import type { CoverageJob, CoverageJobReply } from './protocol';

/** Motores ya creados, por su descripción: el mismo motor sirve para muchas tandas. */
const engines = new Map<string, Promise<PropagationEngine>>();

function engineFor(job: CoverageJob): Promise<PropagationEngine> {
  const key = JSON.stringify(job.engine);
  let engine = engines.get(key);
  if (!engine) {
    engine = createEngine(job.engine);
    engines.set(key, engine);
  }
  return engine;
}

const reply = (message: CoverageJobReply, transfer: Transferable[] = []) =>
  (self as unknown as Worker).postMessage(message, transfer);

self.addEventListener('message', async (event: MessageEvent<CoverageJob>) => {
  const job = event.data;
  try {
    const engine = await engineFor(job);
    const points = Math.floor((job.samplesPerRadial - 1) / job.stride);
    const lossDb = job.links.map(() => new Float32Array(job.radialCount * points));
    const warnings = job.links.map(() => new Int32Array(job.radialCount * points));

    for (let r = 0; r < job.radialCount; r++) {
      const elevationsM = job.profiles.subarray(r * job.samplesPerRadial, (r + 1) * job.samplesPerRadial);
      job.links.forEach((link, l) => {
        const result = engine.radialLoss({
          elevationsM,
          stepM: job.stepM,
          txHeightM: link.siteHeightM,
          rxHeightM: link.radioHeightM,
          frequencyMHz: link.frequencyMHz,
          stride: job.stride,
        });
        lossDb[l]!.set(result.lossDb, r * points);
        warnings[l]!.set(result.warnings, r * points);
      });
    }

    reply({ type: 'result', jobId: job.jobId, lossDb, warnings }, [
      ...lossDb.map((a) => a.buffer),
      ...warnings.map((a) => a.buffer),
    ]);
  } catch (error) {
    reply({ type: 'error', jobId: job.jobId, message: error instanceof Error ? error.message : String(error) });
  }
});
