// Compatibilidad para compilar el ITM de NTIA con Emscripten sin modificar su código.
// itm.h declara sus funciones con `__declspec(dllexport)`, que solo existe en Windows;
// aquí se anula y las funciones quedan como `extern "C"` normales.
#pragma once
#define __declspec(x)
