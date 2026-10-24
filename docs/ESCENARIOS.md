# Escenarios de simulación

El selector de escenarios (`/escenarios`) pregunta «¿Qué quieres simular?» y cada respuesta abre una página con su propio modelo de propagación y su propio entorno. Este documento resume qué calcula cada una, con qué modelo y con qué valores por omisión.

| Página | Dirección | Entorno | Modelo |
| --- | --- | --- | --- |
| Radiocomunicaciones en terreno | `/terreno?banda=vhf\|uhf\|700\|800` | Mapa con relieve SRTM | ITM (Longley-Rice) de NTIA |
| Radiodifusión FM y AM | `/radiodifusion?servicio=fm\|am` | Mapa con relieve | FM: ITM. AM: onda de tierra Sommerfeld-Norton |
| Celular (LTE / 5G) | `/celular?banda=700\|850\|1900\|aws\|2600\|3500` | Mapa con relieve | Okumura-Hata / COST-231, 3GPP 38.901 UMa o ITM |
| Enlaces punto a punto | `/enlace?tipo=microondas\|radio` | Mapa y perfil del enlace | Espacio libre + difracción Deygout + gases; ITM |
| Interiores (WiFi) | `/interiores?plano=casa\|apartamento\|oficina` | Editor de planos | Multipared COST-231 |
| Cavernas, túneles y minas | `/cavernas?escenario=mina\|tunel\|cueva` | Editor de galerías | Guía de onda de Emslie, curvas y cable radiante |

Todas las fórmulas viven en módulos puros (`src/rf/`, `src/indoor/`, `src/cave/`) con pruebas que usan valores calculados a mano.

## Radiocomunicaciones en terreno (LMR)

- Bajada y subida por separado, cada una con su frecuencia y su cadena; mapa de desbalance.
- Bandas de ejemplo: VHF 152/157 MHz, UHF 460/465, 700 MHz 770/800, 800 MHz 860/815. La línea de 7/8" pierde ~1,4, 2,6, 3,6 y 3,9 dB/100 m respectivamente.

## Radiodifusión

- **FM:** campo en dBµV/m con el ITM sobre el relieve; receptor a 10 m por omisión (referencia de planificación) o 1,5 m (portátil). Zonas de la ITU-R BS.412: 74 (estéreo, ciudades grandes), 66 (estéreo, urbano), 54 (estéreo, rural) y 48 dBµV/m (mono, rural).
- **AM:** onda de tierra con la aproximación de Terman del factor de Sommerfeld-Norton, 8 tipos de suelo de la ITU-R P.368 y monopolos de 300, 313 y 410 mV/m a 1 km con 1 kW. Zonas de 5, 2 y 0,5 mV/m.
- **Limitación:** el modelo AM es de Tierra plana y vale hasta ~80/f(MHz)^⅓ km (80 km a 1 MHz); más allá aparece rayado porque la predicción es optimista. No modela trayectos mixtos tierra-mar ni la onda de cielo nocturna.

## Celular

- Hasta 4 sectores con el patrón de antena 3GPP (horizontal y vertical con inclinación). La pérdida se calcula una vez por sitio y el patrón se aplica al pintar.
- Vistas: RSRP del mejor sector, mejor sector y SINR con todos los sectores transmitiendo (carga 100 %).
- **Hata** usa como altura efectiva la mayor entre la altura de la torre y su altura sobre el terreno promedio de 3 a 15 km. Se ajustó de 1 a 20 km; entre 0,5 y 1 km se extrapola y por debajo aparece rayado. No vale sobre 2000 MHz.
- **3GPP 38.901 UMa** (ciudad sin línea de vista) vale hasta 5 km y de 0,5 a 100 GHz: es el modelo para 2600 y 3500 MHz.
- **Limitación:** no hay interferencia entre sitios distintos (un solo sitio por cálculo) ni ganancia de beamforming de 5G.

## Enlaces punto a punto

- Perfil con la curvatura de la Tierra según el factor k (4/3, 1 o 2/3), primera zona de Fresnel, línea del 60 % y puntos que la invaden.
- Pérdida: espacio libre + difracción por aristas (ITU-R P.526, Deygout hasta 3 aristas) + gases (ITU-R P.676 aproximada). El ITM aparece como comparación y se puede usar para el balance (por omisión en radioenlaces VHF/UHF).
- Disponibilidad por desvanecimiento multitrayecto con Vigants-Barnett.
- **Limitación:** no incluye lluvia, que sobre 10 GHz es la causa principal de cortes.

## Interiores (WiFi)

- Editor: muros encadenados con ajuste a 25 cm y a los extremos de otros muros, 8 materiales, access points, deshacer y guardado en el navegador.
- Modelo multipared: espacio libre a la distancia directa más la pérdida de cada muro cruzado. Pérdidas típicas por material a 2,4, 5 y 6 GHz (ITU-R P.2040 y guías de diseño WiFi).
- **Limitación:** un solo piso; no modela reflexiones ni el ángulo con que la señal cruza el muro.

## Cavernas, túneles y minas

- Editor: galerías como polilíneas con ancho y alto; empezar o terminar sobre otra galería crea un cruce. Antenas y cable radiante.
- Cada galería es una guía de onda (Emslie, Lagace y Strong, 1975): espacio libre hasta la distancia de quiebre máx(a², b²)/λ y, desde ahí, atenuación modal (más la de rugosidad). La señal recorre el grafo de galerías por el camino de menor pérdida y suma una pérdida en cada curva o cruce.
- El cable radiante alimenta los nodos cercanos con su pérdida longitudinal y de acople a 2 m.
- Calculadora de comunicación a través de la roca en baja frecuencia (profundidad de penetración y absorción).
- **Limitación:** la pérdida en curvas es empírica; el modelo no distingue la forma del cruce ni la posición de la antena dentro de la sección.

## Valores por omisión

Son valores típicos de partida; conviene ajustarlos con los datos de los equipos y con mediciones:

| Escenario | Valor | Por omisión |
| --- | --- | --- |
| Celular | Potencia y antena por sector | 40 W, 17 dBi, 65° × 7°, inclinación 4°, cable 2 dB |
| Celular | Umbrales de RSRP | −80, −90, −100 y −110 dBm |
| Enlaces | Umbral del receptor | −70 dBm (microondas), −110 dBm (VHF/UHF) |
| Interiores | Pérdida por material | Tabla de la página (por ejemplo ladrillo 8/12/14 dB a 2,4/5/6 GHz) |
| Cavernas | Pérdida en curva de 90° | 15 + 10·log(f/100 MHz): ~17 dB en VHF, ~25 dB a 900 MHz |
| Cavernas | Cable radiante | 1/2", de 1,5 dB/100 m y 60 dB de acople (FM) a 10 dB/100 m y 80 dB (2,4 GHz) |
| Cavernas | Roca | εr de 4 a 8 y rugosidad de 2 a 30 cm según el tipo |
