// Texto propio de cada simulación: título principal, qué calcula y con qué modelo, y preguntas
// frecuentes. Va en el HTML estático de cada página (lo leen Google, Bing y los asistentes de
// IA sin ejecutar JavaScript) y, dentro de la app, al final del panel en "Acerca de esta
// simulación". Módulo puro: lo usa la configuración de Vite al compilar.

export interface FaqItem {
  q: string;
  a: string;
}

export interface PageContent {
  /** Título principal (h1), con las palabras que la gente busca. */
  h1: string;
  /** Párrafos que explican qué calcula, con qué modelo y un ejemplo con números. */
  about: string[];
  faq: FaqItem[];
}

/** Preguntas que valen para todas las simulaciones. */
const COMMON_FAQ: FaqItem[] = [
  {
    q: '¿Hertzo es gratis?',
    a: 'Sí. Es software libre con licencia MIT: no pide cuenta ni pago, y todos los cálculos se hacen en tu navegador, sin enviar tus datos a un servidor.',
  },
  {
    q: '¿Qué tan exacto es?',
    a: 'Usa modelos de propagación reconocidos (NTIA, UIT, 3GPP) sobre el terreno real, pero es una herramienta de planificación: no reemplaza mediciones de campo ni estudios de ingeniería certificados, en especial para sistemas de misión crítica.',
  },
];

export const PAGE_CONTENT: Record<string, PageContent> = {
  terreno: {
    h1: 'Simulador de cobertura de radio P25, trunking y convencional sobre terreno',
    about: [
      'Calcula la cobertura de una repetidora o un sitio de trunking (P25, SmartZone, convencional) en VHF, UHF, 700 u 800 MHz sobre el relieve real, con el modelo ITM (Longley-Rice) de NTIA y el terreno SRTM. Dibuja por separado la bajada (de la repetidora al radio) y la subida (del radio a la repetidora), porque cada una tiene su potencia, sus ganancias y sus pérdidas.',
      'En el sitio UHF de ejemplo la bajada aguanta 151,7 dB de pérdida y la subida solo 136,5 dB: la subida limita la cobertura por 15,2 dB, y hay zonas donde el radio oye la repetidora pero ella no lo oye a él. Por omisión calcula con 90 % de confiabilidad y con la sensibilidad con desvanecimiento de los equipos P25 (−112 dBm el portátil y −110 dBm la repetidora), como se diseña la radio profesional (TIA TSB-88); puedes ver la mediana (50 %) o el 95 %. También ubica radios concretos y estima cuántas llamadas esperan canal en la hora pico con Erlang C. Antes de simular eliges el entorno del radio: solo relieve en campo despejado, o edificios y árboles con la UIT-R P.2108, donde un portátil a 1 m en entorno urbano pierde unos 22 dB a 860 MHz.',
    ],
    faq: [
      {
        q: '¿Por qué separa la bajada de la subida?',
        a: 'Porque la repetidora transmite con más potencia y antenas más altas que un portátil al cinto. Si solo miras la bajada, el mapa promete cobertura donde el radio no alcanza a la repetidora.',
      },
      {
        q: '¿Qué modelo de propagación usa?',
        a: 'El Irregular Terrain Model (Longley-Rice) v1.4 de NTIA, sin modificaciones, compilado a WebAssembly, sobre el terreno de Terrain Tiles (SRTM). Con "Entorno del equipo", que se elige antes de simular, suma la pérdida por edificios y árboles de la UIT-R P.2108.',
      },
      {
        q: '¿Se pierde lo que hice si cierro la pestaña?',
        a: 'No: cada cambio queda guardado en este navegador, y al volver sigues donde quedaste; solo hay que pulsar "Simular" para ver otra vez la cobertura. "Empezar de nuevo" deja la página con los valores de siempre y se puede deshacer.',
      },
      {
        q: '¿Puedo compartir una simulación?',
        a: 'Sí: el botón de compartir, junto al de exportar en la esquina del mapa, copia un enlace con el sitio, las cadenas de bajada y subida, el radio y los equipos, o lo manda por WhatsApp o correo. Quien lo abre recibe una copia: lo que cambie no afecta la tuya. Los datos van dentro del enlace y no pasan por ningún servidor.',
      },
      ...COMMON_FAQ,
    ],
  },
  lora: {
    h1: 'Simulador de cobertura LoRaWAN de un gateway sobre terreno',
    about: [
      'Calcula la cobertura de un gateway LoRaWAN en AU915 (Colombia), US915 o EU868 sobre el relieve real con el modelo ITM (Longley-Rice) de NTIA. Muestra la bajada, la subida, el desbalance entre las dos y el SF más rápido con el que llega cada punto, con su tiempo en el aire.',
      'Con figura de ruido de 4 dB, el gateway oye SF12 en canales de 125 kHz hasta −139,0 dBm. En AU915, si la red limita cada mensaje a 400 ms, con 11 bytes la subida solo puede usar hasta SF10. El SF de cada punto se elige como lo hace la red (ADR), con 10 dB de margen sobre la sensibilidad, y la cobertura sale con 90 % de confiabilidad. Antes de simular eliges el entorno del sensor (solo relieve, o edificios y árboles con la UIT-R P.2108). Puedes pegar la lista de tus medidores y ver qué parte de los mensajes choca en el aire (ALOHA).',
    ],
    faq: [
      {
        q: '¿Qué plan de frecuencias usa Colombia para LoRaWAN?',
        a: 'AU915 (915–928 MHz). La ANE permite hasta 1 W conducido con antena de hasta 6 dBi en esa banda (Resolución 105 de 2020, anexo 3.6.1.1).',
      },
      {
        q: '¿Qué pasa con un medidor dentro de una caja o a ras de piso?',
        a: 'Elige "Medidor en caja", que suma 15 dB por la caja y pone la antena a 0,5 m, y el entorno que lo rodea. Así el cálculo cuenta lo que pierde la señal por estar abajo y encerrado.',
      },
      {
        q: '¿Se pierde lo que hice si cierro la pestaña?',
        a: 'No: cada cambio queda guardado en este navegador, y al volver sigues donde quedaste; solo hay que pulsar "Simular" para ver otra vez el resultado. "Empezar de nuevo" deja la página con los valores de siempre y se puede deshacer.',
      },
      {
        q: '¿Puedo compartir la simulación con mi cliente?',
        a: 'Sí: el botón de compartir, junto al de exportar en la esquina del mapa, copia un enlace con el gateway, el sensor, los medidores con su tipo y los ajustes de SF y capacidad, o lo manda por WhatsApp o correo. Quien lo abre recibe una copia: lo que cambie no afecta la tuya. Los datos van dentro del enlace y no pasan por ningún servidor.',
      },
      ...COMMON_FAQ,
    ],
  },
  celular: {
    h1: 'Simulador de cobertura celular LTE y 5G por sectores',
    about: [
      'Calcula la señal (RSRP), el mejor sector y la interferencia (SINR) de un sitio celular con varios sectores, de 700 a 3500 MHz, con el patrón de la antena y su inclinación. Puedes elegir el modelo: Okumura-Hata / COST-231 para entornos urbanos, suburbanos o rurales, 3GPP 38.901 para macroceldas urbanas, o ITM sobre el terreno real.',
      'La SINR cuenta seis sitios vecinos a la distancia que elijas, transmitiendo a plena carga: con vecinos a 1 km, en el borde de celda da unos +3 dB, como en una red real. También puedes poner el teléfono dentro de un edificio (pérdida de 3GPP 38.901: unos 15 dB a 850 MHz) y elegir la confiabilidad. En 3500 MHz usa los valores de una antena activa 5G: 200 W y 24 dBi.',
      'La subida se calcula aparte, en su propia frecuencia (en la banda de 850, 836,5 MHz): un teléfono de 23 dBm repartidos en 2 bloques de recursos, una torre con 5 dB de figura de ruido y 3 dB de margen por interferencia. El mapa de desbalance muestra dónde el teléfono ve la red pero la torre no lo oye.',
    ],
    faq: [
      {
        q: '¿Qué es el RSRP?',
        a: 'La potencia de la señal de referencia de LTE y 5G por elemento de recurso, la que muestra el teléfono. Es mucho menor que la potencia total del sector porque se reparte entre todas las subportadoras.',
      },
      {
        q: '¿Cuándo usar Hata, 38.901 o ITM?',
        a: 'Hata vale hasta 2 GHz y de 1 a 20 km; 38.901 cubre las bandas altas como 3500 MHz; ITM usa el relieve real y sirve donde manda el terreno, como en los valles de Antioquia.',
      },
      {
        q: '¿Se pierde lo que hice si cierro la pestaña?',
        a: 'No: cada cambio queda guardado en este navegador, y al volver sigues donde quedaste; solo hay que pulsar "Simular" para ver otra vez el resultado. "Empezar de nuevo" deja la página con los valores de siempre y se puede deshacer.',
      },
      {
        q: '¿Puedo compartir la simulación?',
        a: 'Sí: el botón de compartir, junto al de exportar en la esquina del mapa, copia un enlace con la torre, el modelo, los sectores con su azimut, la antena, la portadora y dónde está el teléfono, o lo manda por WhatsApp o correo. Quien lo abre recibe una copia: lo que cambie no afecta la tuya. Los datos van dentro del enlace y no pasan por ningún servidor.',
      },
      ...COMMON_FAQ,
    ],
  },
  interiores: {
    h1: 'Simulador de cobertura WiFi en interiores con planos',
    about: [
      'Dibuja el plano de una casa, un apartamento o una oficina con sus muros y materiales, ubica los access points y mira el mapa de calor de la señal a 2,4, 5 y 6 GHz. Cada muro resta según su material y la frecuencia, con el modelo multipared COST-231.',
      'Calcula por separado la bajada (del access point al celular o portátil) y la subida (del cliente al access point, que transmite con menos potencia), cuenta que un muro atravesado de lado pierde más y suma la pérdida de muebles y personas. A 6 GHz limita la potencia al máximo para interiores según el ancho de canal.',
    ],
    faq: [
      {
        q: '¿Por qué 5 GHz llega menos lejos que 2,4 GHz?',
        a: 'Porque pierde más en espacio libre y, sobre todo, al atravesar muros de ladrillo y concreto. A cambio tiene más canales y menos interferencia.',
      },
      {
        q: '¿Puedo guardar el plano?',
        a: 'Sí: "Guardar proyecto" descarga un archivo .json con el plano y todos sus ajustes, y "Abrir proyecto" lo vuelve a cargar en otro equipo. Y el botón de compartir, junto al de exportar en la esquina del plano, copia un enlace con el mismo plano o lo manda por WhatsApp o correo: quien lo abre recibe una copia, y el plano que tenía queda en "Deshacer".',
      },
      ...COMMON_FAQ,
    ],
  },
  enlace: {
    h1: 'Simulador de radioenlaces y microondas punto a punto',
    about: [
      'Traza el perfil del terreno entre dos puntos, revisa el despeje de la primera zona de Fresnel con la curvatura de la Tierra y calcula el nivel recibido, el margen de desvanecimiento y la disponibilidad de un radioenlace VHF/UHF o de microondas.',
      'Por ejemplo, a 6 GHz y 20 km la primera zona de Fresnel mide 15,8 m de radio en la mitad del trayecto. El veredicto pide el 100 % de ella libre con k = 4/3 y el 60 % con k = 2/3, y la disponibilidad suma el corte por lluvia (UIT-R P.838-3 y P.530) al de multitrayecto: un enlace de 11 GHz y 11 km en los Andes corta unos 47 minutos al año por lluvia.',
    ],
    faq: [
      {
        q: '¿Qué es la zona de Fresnel?',
        a: 'El elipsoide alrededor de la línea de vista por donde viaja la mayor parte de la energía. Si el terreno o un edificio la invade, el enlace pierde señal aunque haya línea de vista.',
      },
      {
        q: '¿Qué modelos usa?',
        a: 'Espacio libre, difracción por aristas de la UIT-R P.526 e ITM sobre el perfil real; la lluvia con la UIT-R P.838-3 y la P.530-18, y el multitrayecto con Vigants-Barnett.',
      },
      {
        q: '¿Se pierde lo que hice si cierro la pestaña?',
        a: 'No: cada cambio queda guardado en este navegador, y al volver sigues donde quedaste; solo hay que pulsar "Simular" para ver otra vez el resultado. "Empezar de nuevo" deja la página con los valores de siempre y se puede deshacer.',
      },
      {
        q: '¿Puedo compartir el enlace calculado?',
        a: 'Sí: el botón de compartir, junto al de exportar en la esquina del mapa, copia un enlace con los extremos A y B, la frecuencia, las antenas, el factor k, la lluvia y el clima, o lo manda por WhatsApp o correo. Quien lo abre recibe una copia y pulsa "Simular" para ver el perfil: lo que cambie no afecta la tuya. Los datos van dentro del enlace y no pasan por ningún servidor.',
      },
      ...COMMON_FAQ,
    ],
  },
  radiodifusion: {
    h1: 'Simulador de cobertura de emisoras FM y AM',
    about: [
      'Calcula la intensidad de campo en dBµV/m de una emisora y sus zonas de servicio. FM se calcula con ITM sobre el relieve real, con la confiabilidad y el entorno del receptor que elijas; AM con onda de tierra sobre la Tierra esférica (Norton y la serie de Wait), según la conductividad del suelo, con los contornos de 62, 56, 54 y 48 dBµV/m del Decreto 1445 de 1995.',
      'La cobertura AM es la diurna: de noche la onda de cielo trae interferencia de otras emisoras y la cobertura se encoge. Sirve para estimar hasta dónde llega una emisora antes de pedir la licencia o cambiar la antena.',
    ],
    faq: [
      {
        q: '¿Por qué AM llega más lejos que FM?',
        a: 'Porque en onda media la señal viaja pegada al suelo (onda de tierra) y rodea el relieve; FM, en VHF, depende de la línea de vista y las montañas la bloquean.',
      },
      {
        q: '¿Qué es un dBµV/m?',
        a: 'La intensidad del campo eléctrico en decibelios sobre 1 microvoltio por metro, la unidad con que se definen las zonas de servicio de las emisoras.',
      },
      {
        q: '¿Puedo compartir la cobertura de mi emisora?',
        a: 'Sí: el botón de compartir, junto al de exportar en la esquina del mapa, copia un enlace con el transmisor, la frecuencia, la potencia, la antena, el suelo y los umbrales de cada zona, o lo manda por WhatsApp o correo. Quien lo abre recibe una copia: lo que cambie no afecta la tuya. Los datos van dentro del enlace y no pasan por ningún servidor.',
      },
      ...COMMON_FAQ,
    ],
  },
  cavernas: {
    h1: 'Simulador de radio en túneles, minas y cavernas',
    about: [
      'Dibuja las galerías de una mina, un túnel vial o una caverna y simula la señal de radios, repetidores y cable radiante a lo largo de cada galería, con las pérdidas en curvas y cruces, en bajada (del repetidor al portátil) y en subida (del portátil al repetidor).',
      'Un túnel se comporta como una guía de onda (modelo de Emslie, con la rugosidad y la inclinación de las paredes): las frecuencias altas avanzan mejor en tramos rectos y las bajas, como VHF, se atenúan rápido en galerías pequeñas. Por eso bajo tierra se usa cable radiante, que Hertzo calcula con los datos de un cable real de 1/2" (RFS RLKW12-50).',
    ],
    faq: [
      {
        q: '¿Por qué la VHF casi no avanza en una galería pequeña?',
        a: 'Porque la galería deja pasar mejor las ondas cuya longitud es pequeña frente a su sección; a 150 MHz la onda mide 2 m y en una galería de 4 × 4 m se atenúa mucho por cada 100 m.',
      },
      {
        q: '¿Qué es un cable radiante?',
        a: 'Un cable coaxial con ranuras que deja salir y entrar la señal a lo largo de todo el túnel, como una antena larga. Se usa en minas y túneles viales para cubrir donde las antenas no llegan.',
      },
      {
        q: '¿Puedo compartir la red de galerías?',
        a: 'Sí: el botón de compartir, junto al de exportar en la esquina del plano, copia un enlace con las galerías, las antenas, el cable radiante y los ajustes de roca y radio, o lo manda por WhatsApp o correo. Quien lo abre recibe una copia, y la red que tenía queda en "Deshacer". También puedes guardar el proyecto como archivo .json.',
      },
      ...COMMON_FAQ,
    ],
  },
};

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bloque "Acerca de esta simulación" de una página; vacío si no tiene texto propio. */
export function aboutHtml(path: string): string {
  const c = PAGE_CONTENT[path];
  if (!c) return '';
  return `<details class="panel-section page-about" data-page-about>
        <summary><h1>${escapeHtml(c.h1)}</h1></summary>
        ${c.about.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n        ')}
        <h2>Preguntas frecuentes</h2>
        <dl>
          ${c.faq.map((f) => `<dt>${escapeHtml(f.q)}</dt><dd>${escapeHtml(f.a)}</dd>`).join('\n          ')}
        </dl>
      </details>`;
}
