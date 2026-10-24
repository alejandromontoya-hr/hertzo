// Tipos del módulo generado por Emscripten (engine/build.mjs).

export interface ItmWasmModule {
  HEAPF64: Float64Array;
  HEAPF32: Float32Array;
  HEAP32: Int32Array;
  _malloc(bytes: number): number;
  _free(pointer: number): void;
  _hertzo_itm_p2p(
    hTxMeter: number,
    hRxMeter: number,
    pflPointer: number,
    climate: number,
    n0: number,
    frequencyMHz: number,
    polarization: number,
    epsilon: number,
    sigma: number,
    mdvar: number,
    time: number,
    location: number,
    situation: number,
    outLossPointer: number,
    outWarningsPointer: number,
  ): number;
  _hertzo_itm_radial(
    pflPointer: number,
    stride: number,
    hTxMeter: number,
    hRxMeter: number,
    climate: number,
    n0: number,
    frequencyMHz: number,
    polarization: number,
    epsilon: number,
    sigma: number,
    mdvar: number,
    time: number,
    location: number,
    situation: number,
    outLossPointer: number,
  ): number;
}

export default function createItmModule(): Promise<ItmWasmModule>;
