# Escenarios de simulación

El selector de escenarios (`/escenarios`) pregunta "¿Qué quieres simular?" y cada respuesta abre una página con su propio modelo de propagación y su propio entorno. Este documento resume qué calcula cada una, con qué modelo, con qué valores por omisión y qué no cubre.

| Página | Dirección | Entorno | Modelo |
| --- | --- | --- | --- |
| Celular (LTE / 5G) | `/celular?banda=700\|850\|1900\|aws\|2600\|3500` | Mapa con relieve | Okumura-Hata / COST-231, 3GPP 38.901 UMa o ITM; entrada a edificios de 38.901; bajada y subida en sus frecuencias |
| Interiores (WiFi) | `/interiores?plano=casa\|apartamento\|oficina` | Editor de planos | Multipared COST-231 con ángulo de incidencia y muebles |
| LoRaWAN | `/lora?banda=au915\|us915\|eu868` | Mapa con relieve SRTM | ITM (Longley-Rice) de NTIA; sensibilidad y tiempo en el aire de Semtech |
| Radiocomunicaciones en terreno | `/terreno?banda=vhf\|uhf\|700\|800` | Mapa con relieve SRTM | ITM (Longley-Rice) de NTIA |
| Enlaces punto a punto | `/enlace?tipo=microondas\|radio` | Mapa y perfil del enlace | Espacio libre + difracción por aristas (UIT-R P.526) + gases + lluvia; ITM |
| Radiodifusión FM y AM | `/radiodifusion?servicio=fm\|am` | Mapa con relieve | FM: ITM. AM: onda de tierra sobre la Tierra esférica (Norton y serie de Wait) |
| Cavernas, túneles y minas | `/cavernas?escenario=mina\|tunel\|cueva` | Editor de galerías | Guía de onda de Emslie, curvas y cable radiante |

Todas las fórmulas viven en módulos puros (`src/rf/`, `src/indoor/`, `src/cave/`, `src/devices/`) con pruebas que usan valores calculados a mano. Todas las páginas calculan la bajada y la subida por separado.

## Lo que comparten las páginas con mapa

- **Confiabilidad** (Terreno, LoRa, FM y Celular): 50 % (la mediana), 90 % o 95 %. Con el ITM es el porcentaje de tiempo del modo móvil, que en ese modo cuenta tiempo y ubicación juntos; con Hata y 38.901 es un margen z·σ (σ = 8 dB en Hata y 6 dB en UMa). En el terreno de Medellín, 90 % exige unos 12 dB más que la mediana y 95 % unos 16 dB.
- **Entorno del equipo** (Terreno, LoRa, FM y Celular con ITM): UIT-R P.2108-1, sección 3.1. El trayecto se calcula con la antena subida a la altura de lo que la rodea y se suma la pérdida de cada extremo: abierto (10 m), suburbano (10 m), urbano (15 m) o urbano denso (20 m), con la altura editable. Un equipo a 2 m en entorno urbano suma 22,35 dB a 916,8 MHz. Terreno y LoRa parten de urbano o arbolado (15 m); `?entorno=ninguno` deja solo el relieve.
- **Equipos concretos** (Terreno y LoRa): cada equipo se calcula con el ITM punto a punto a su altura; a menos de 50 m del sitio, con espacio libre y la distancia real a la antena.
- **Exportar:** KMZ para Google Earth y CSV de los equipos.

## Radiocomunicaciones en terreno (LMR)

- Bajada y subida por separado, cada una con su frecuencia y su cadena; mapa de desbalance.
- Bandas de ejemplo: VHF 152/157 MHz, UHF 460/465, 700 MHz 770/800, 800 MHz 860/815. La línea de 7/8" pierde ~1,4, 2,6, 3,6 y 3,9 dB/100 m (CommScope LDF5-50A: 1,48 dB/100 m a 150 MHz y 2,49 a 400 MHz).
- Sensibilidades con desvanecimiento (5 % BER), como pide la TIA TSB-88 porque el ITM da la señal promedio sin el desvanecimiento rápido: −112 dBm el portátil (Motorola APX 8000, estática −120,5) y −110 dBm la repetidora (GTR 8000, estática −118 a −119).
- Capacidad: Erlang C con radios, llamadas por radio en la hora pico, duración y canales de voz; espera promedio y llamadas que esperan más de lo aceptable.
- **Limitación:** no modela interferencia entre sitios ni simulcast.

## LoRaWAN

- Planes AU915 (Colombia; subida 916,8 MHz a 125 kHz, bajada 923,3 MHz a 500 kHz), US915 y EU868 (LoRa Alliance RP002-1.0.3).
- Sensibilidad = −174 + 10·log(BW) + figura de ruido + SNR límite por SF (Semtech): el gateway con NF 4 dB oye SF12 hasta −139,0 dBm. Tiempo en el aire según Semtech AN1200.13.
- El SF de cada punto se elige como el ADR de la red: el más rápido que deja 10 dB de margen sobre la sensibilidad (ChirpStack; The Things Stack usa 15). Con el límite de 400 ms de AU915, 11 bytes llegan hasta SF10.
- Capacidad: ALOHA puro por SF (pérdida = 1 − e^(−2G)); no cuenta el efecto captura.
- Potencia del gateway según la ANE (Resolución 105 de 2020, anexo 3.6.1.1): máximo 1 W conducido con antena de hasta 6 dBi.

## Celular

- Hasta 4 sectores con el patrón de antena 3GPP (horizontal y vertical con inclinación). La pérdida se calcula una vez por sitio y el patrón se aplica al pintar.
- Vistas: RSRP del mejor sector, mejor sector y SINR a plena carga con los demás sectores y con seis sitios vecinos iguales a la distancia que se elija (1 km por omisión). La señal de los vecinos usa la pérdida típica por distancia del propio cálculo. Con vecinos a 1 km, en el borde de celda la SINR da unos +3 dB, como en una red real.
- **Hata** usa como altura efectiva la mayor entre la altura de la torre y su altura sobre el terreno promedio de 3 a 15 km. Se ajustó de 1 a 20 km; entre 0,5 y 1 km se extrapola y por debajo aparece rayado. No vale sobre 2000 MHz. Nunca da menos pérdida que el espacio libre.
- **3GPP 38.901 UMa** (ciudad sin línea de vista) vale hasta 5 km y de 0,5 a 100 GHz: es el modelo para 2600 y 3500 MHz. Toma el teléfono desde 1,5 m.
- **Teléfono dentro de un edificio** (38.901, modelo O2I): vidrio común y concreto suma 14,7 dB a 850 MHz y 16,9 dB a 3500 MHz; vidrio reflectivo, 31,0 dB a 3500 MHz.
- **Limitación:** los vecinos son copias del sitio, no la red real del operador; no hay ganancia de beamforming por usuario.

## Enlaces punto a punto

- Perfil con la curvatura de la Tierra según el factor k (4/3, 1 o 2/3), primera zona de Fresnel, línea del 60 % y puntos que la invaden. El veredicto pide las dos condiciones: 100 % de F1 libre con k = 4/3 y 60 % con k = 2/3.
- Pérdida: espacio libre + difracción por aristas en cascada (UIT-R P.526-10 §4.4.2: Deygout hasta 3 aristas con la corrección T y C) + gases (UIT-R P.676 aproximada, a nivel del mar). El ITM aparece como comparación y se puede usar para el balance (modo accidental, el de enlaces fijos).
- Disponibilidad: lluvia (UIT-R P.838-3 y P.530-18, con R0,01 de 95 mm/h por omisión, zona N de la P.837-1, y polarización) más multitrayecto (Vigants-Barnett, con factor de terreno a y de clima b; por omisión terreno promedio y clima cálido y húmedo). El enlace de ejemplo a 11 GHz y 11,4 km corta 47 min al año por lluvia y 17 por multitrayecto.
- **Limitación:** no incluye árboles ni edificios junto a las antenas (el SRTM no los trae del todo).

## Radiodifusión

- **FM:** campo en dBµV/m con el ITM sobre el relieve; receptor a 10 m por omisión (referencia de planificación) o 1,5 m (portátil). Zonas de la UIT-R BS.412: 74 (estéreo, ciudades grandes), 66 (estéreo, urbano; también el contorno de servicio de la ANE), 54 (estéreo, rural) y 48 dBµV/m (mono, rural). Confiabilidad 50 % por omisión, como las curvas F(50,50), y entorno del receptor.
- **AM:** cobertura diurna con onda de tierra: Norton exacto cerca del transmisor y la serie de residuos de Wait sobre la Tierra esférica más lejos, validada con los casos de prueba del LFMF de NTIA. 8 tipos de suelo de la UIT-R P.368 y monopolos de 300, 313 y 444 mV/m a 1 km con 1 kW. Contornos de 62, 56, 54 y 48 dBµV/m (1250, 625, 500 y 250 µV/m, Decreto 1445 de 1995).
- **Limitación:** no modela trayectos mixtos tierra-mar ni la onda de cielo nocturna, que de noche trae interferencia y encoge la cobertura AM.

## Interiores (WiFi)

- Editor: muros encadenados con ajuste a 25 cm y a los extremos de otros muros, 8 materiales, access points, deshacer, guardado en el navegador y proyectos (.json).
- Modelo multipared: espacio libre a la distancia directa más la pérdida de cada muro cruzado, multiplicada por 1/cos θ (hasta el doble) cuando la señal lo cruza de lado. Pérdidas típicas por material a 2,4, 5 y 6 GHz (UIT-R P.2040 y guías de diseño WiFi).
- "Mobiliario y personas": exponente de 2 (espacio vacío), 2,4 (casa amueblada) o 2,6 (oficina con puestos) desde 1 m.
- Bajada (del access point al cliente) y subida (del cliente al access point, 15 dBm a 2,4 GHz y 13 dBm a 5 y 6 GHz), y la peor de las dos.
- A 6 GHz, solo interiores con 5 dBm/MHz de densidad de PIRE en el access point y −1 dBm/MHz en el cliente, con tope de 30 y 24 dBm (ANE, Resolución 737 de 2022).
- **Limitación:** un solo piso; no modela reflexiones.

## Cavernas, túneles y minas

- Editor: galerías como polilíneas con ancho y alto; empezar o terminar sobre otra galería crea un cruce. Antenas, cable radiante y proyectos (.json).
- Cada galería es una guía de onda (Emslie, Lagace y Strong, 1975): espacio libre hasta la distancia de quiebre máx(a², b²)/λ y, desde ahí, atenuación modal más rugosidad e inclinación de las paredes (1° por omisión, como NIOSH). La señal recorre el grafo de galerías por el camino de menor pérdida y suma una pérdida en cada curva o cruce, en proporción a su ángulo.
- El cable radiante usa los datos del RFS RLKW12-50 (1/2"): 5,74 dB/100 m y 62 dB de acople a 450 MHz, interpolados por frecuencia; avisa si se usa sobre 1950 MHz.
- Bajada (del repetidor al portátil) y subida (del portátil al repetidor), y la peor de las dos. Avisa cuando una galería pierde más de 20 dB/100 m y hace falta cable radiante.
- Calculadora de comunicación a través de la roca en baja frecuencia (profundidad de penetración y absorción).
- **Limitación:** la pérdida en curvas es empírica, sin una fuente publicada; conviene calibrarla con mediciones.

## Valores por omisión

Son valores típicos de partida; conviene ajustarlos con los datos de los equipos y con mediciones:

| Escenario | Valor | Por omisión |
| --- | --- | --- |
| Terreno | Sitio | 100 W, 6 dBd a 50 m, 60 m de línea 7/8"; sensibilidad −110 dBm |
| Terreno | Radio | Portátil en la cintura: 3 W, −3 dBd, 12 dB de pérdida por el cuerpo, −112 dBm |
| Terreno y LoRa | Confiabilidad | 90 % |
| Terreno y LoRa | Entorno del equipo | Urbano o arbolado, 15 m (UIT-R P.2108) |
| LoRa | Gateway | 0,5 W, 10 m de cable (12,8 dB/100 m), conector 0,5 dB, 3 dBd a 30 m, NF 4 dB |
| LoRa | Sensor | En poste: 0,1 W, 0 dBd a 2 m. Medidor en caja: 0,025 W, −3 dBd a 0,5 m y 15 dB por la caja |
| LoRa | Mensaje y ADR | 11 bytes; 10 dB de margen |
| Celular | Potencia y antena por sector | 40 W, 17 dBi, 65° × 7°, inclinación 4°, cable 2 dB; en 3500 MHz antena activa de 200 W y 24 dBi sin cable, NR 80 MHz |
| Celular | Umbrales de RSRP | −80, −90, −100 y −110 dBm |
| Celular | Sitios vecinos | 1 km |
| Celular | Subida | Teléfono de 23 dBm en 2 bloques, torre con 5 dB de figura de ruido, 3 dB de margen por interferencia; umbrales de SINR 20, 10, 0 y −5 dB |
| Enlaces | Umbral del receptor | −70 dBm (microondas), −110 dBm (VHF/UHF) |
| Enlaces | Lluvia | R0,01 de 95 mm/h, polarización vertical |
| Interiores | Pérdida por material | Tabla de la página (por ejemplo ladrillo 8/12/14 dB a 2,4/5/6 GHz) |
| Interiores | Ancho de canal | 20 MHz a 2,4 GHz, 40 a 5 GHz y 80 a 6 GHz |
| Cavernas | Pérdida en curva de 90° | 15 + 10·log(f/100 MHz): ~17 dB en VHF, ~25 dB a 900 MHz |
| Cavernas | Cable radiante | RFS RLKW12-50 (1/2"): de 3,1 dB/100 m y 64 dB de acople a 150 MHz a 21,6 dB/100 m y 62 dB a 1900 MHz |
| Cavernas | Portátil | VHF 37 dBm, UHF 36, 800 MHz 34,8, WiFi 15; sensibilidad −112 dBm en VHF, UHF y 800 MHz |
| Cavernas | Roca | εr de 4 a 8, rugosidad de 2 a 30 cm según el tipo e inclinación de 1° |

## Validación con mediciones (6 de noviembre de 2026)

Se comparó el cálculo de Hertzo (terreno de Terrain Tiles + ITM, sin entorno) con 538 mediciones de campo del banco de datos VHF/UHF de la UIT-R (DBSG3, 150 a 1000 MHz, de 1 a 100 km, receptor a 10 m). Error = predicho − medido:

| Datos | Mediciones | Error medio | Mediana | Desviación | Dentro de ±10 dB |
| --- | --- | --- | --- | --- | --- |
| Alemania (Alpes, Grünten) | 49 | +5,4 dB | +3,8 dB | 15,2 dB | 51 % |
| EBU (Francia, Alpes y llanura) | 169 | −8,3 dB | −3,1 dB | 23,8 dB | 46 % |
| BBC (Reino Unido) | 200 | +18,7 dB | +19,0 dB | 13,2 dB | 24 % |
| MRC (Reino Unido) | 120 | +19,6 dB | +19,1 dB | 16,2 dB | 24 % |

- En montaña la mediana queda entre −3 y +4 dB.
- En el Reino Unido, sin entorno, el cálculo da unos 19 dB de más: el relieve no trae casas ni árboles. Con el entorno "Urbano o arbolado" de la UIT-R P.2108, un receptor a 10 m pierde unos 13 dB, que explican la mayor parte. Por eso Terreno y LoRa parten de "Urbano o arbolado" y la página avisa cuando se elige "Sin entorno"; en montaña despejada, donde sin entorno el error queda entre −3 y +4 dB, conviene cambiarlo a "Abierto o rural" o a "Sin entorno".
- La desviación de 13 a 24 dB es la de comparar puntos sueltos: incluye el desvanecimiento de cada lugar, que ningún modelo predice punto a punto.
- Las distancias calculadas coinciden con las del banco (diferencia media 0,1 km) y la cota del terreno en el transmisor coincide en la mediana (0 m).
- Falta la validación con sitios reales de Antioquia que pide la fase 1.

