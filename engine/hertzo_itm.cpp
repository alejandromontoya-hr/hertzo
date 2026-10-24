// Puente entre Hertzo y el ITM (Longley-Rice) de NTIA, compilado a WebAssembly.
//
// Formato PFL del ITM: pfl[0] = número de tramos (muestras − 1), pfl[1] = separación
// entre muestras (m), pfl[2...] = cotas del terreno (m), del transmisor al receptor.

#include <cmath>
#include <emscripten/emscripten.h>
#include "itm.h"
#include "Errors.h"

extern "C" {

// Pérdida básica de transmisión (dB) de un trayecto punto a punto. Devuelve el código
// del ITM: 0 éxito, 1 éxito con advertencias, 1000 o más error.
EMSCRIPTEN_KEEPALIVE int hertzo_itm_p2p(double h_tx__meter, double h_rx__meter, const double *pfl,
                                        int climate, double N_0, double f__mhz, int pol, double epsilon,
                                        double sigma, int mdvar, double time, double location,
                                        double situation, double *out_loss__db, long *out_warnings) {
    return ITM_P2P_TLS(h_tx__meter, h_rx__meter, pfl, climate, N_0, f__mhz, pol, epsilon, sigma, mdvar,
                       time, location, situation, out_loss__db, out_warnings);
}

// Pérdidas a lo largo de un radial que sale del transmisor.
//
// `pfl` trae el perfil completo del radial en formato PFL. Para cada punto de cálculo se
// reutiliza el mismo arreglo cambiando solo pfl[0] (el número de tramos), así que el
// perfil hasta ese punto no se copia. Se calcula cada `stride` muestras: la salida k
// corresponde a la muestra (k + 1)·stride. Al terminar, pfl[0] queda como llegó.
//
// `out_warnings` recibe las banderas de advertencia del ITM de cada punto (Warnings.h).
//
// Devuelve 0 si todo salió bien o el primer código de error del ITM; los puntos con
// error quedan en NaN.
EMSCRIPTEN_KEEPALIVE int hertzo_itm_radial(double *pfl, int stride, double h_tx__meter, double h_rx__meter,
                                           int climate, double N_0, double f__mhz, int pol, double epsilon,
                                           double sigma, int mdvar, double time, double location,
                                           double situation, float *out_loss__db, int *out_warnings) {
    const double intervals = pfl[0];
    const int count = static_cast<int>(intervals) / stride;
    int first_error = 0;
    for (int k = 0; k < count; k++) {
        pfl[0] = static_cast<double>((k + 1) * stride);
        double loss = 0;
        long warnings = 0;
        const int code = ITM_P2P_TLS(h_tx__meter, h_rx__meter, pfl, climate, N_0, f__mhz, pol, epsilon, sigma,
                                     mdvar, time, location, situation, &loss, &warnings);
        if (code > SUCCESS_WITH_WARNINGS) {
            if (first_error == 0) first_error = code;
            out_loss__db[k] = NAN;
        } else {
            out_loss__db[k] = static_cast<float>(loss);
        }
        out_warnings[k] = static_cast<int>(warnings);
    }
    pfl[0] = intervals;
    return first_error;
}

}  // extern "C"
