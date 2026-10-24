// Interfaz común de los motores de propagación. Hoy existe ITM (Longley-Rice); después
// se agregan modelos de celular, WiFi o cavernas sin cambiar el resto de la app.

/** Un radial que sale del transmisor: perfil de terreno con muestras equiespaciadas. */
export interface RadialRequest {
  /** Cotas del terreno (m) desde el transmisor (índice 0) hacia afuera. */
  elevationsM: Float32Array;
  /** Separación entre muestras (m). */
  stepM: number;
  /** Altura de la antena transmisora sobre el terreno (m). */
  txHeightM: number;
  /** Altura de la antena receptora sobre el terreno (m). */
  rxHeightM: number;
  frequencyMHz: number;
  /**
   * Cada cuántas muestras se calcula la pérdida. Con muestras cada 30 m y stride 3 se
   * calcula cada 90 m, pero cada cálculo usa el perfil completo a 30 m.
   */
  stride: number;
}

/** Resultado de un radial. La posición k corresponde a la muestra (k + 1)·stride. */
export interface RadialResult {
  /** Pérdida básica de transmisión (dB, antenas isotrópicas); NaN donde el modelo no pudo calcular. */
  lossDb: Float32Array;
  /** Banderas de advertencia propias del motor en cada punto (0 = ninguna). */
  warnings: Int32Array;
}

export interface PropagationEngine {
  readonly id: string;
  readonly name: string;
  radialLoss(request: RadialRequest): RadialResult;
}
