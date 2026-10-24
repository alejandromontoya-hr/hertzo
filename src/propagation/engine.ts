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

export interface PropagationEngine {
  readonly id: string;
  readonly name: string;
  /**
   * Pérdida básica de transmisión (dB, antenas isotrópicas) a lo largo del radial.
   * La salida k corresponde a la muestra (k + 1)·stride; NaN donde el modelo no pudo calcular.
   */
  radialLoss(request: RadialRequest): Float32Array;
}
