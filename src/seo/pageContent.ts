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
      'En el sitio UHF de ejemplo la bajada aguanta 155,7 dB de pérdida y la subida solo 145,5 dB: la subida limita la cobertura por 10,2 dB, y hay zonas donde el radio oye la repetidora pero ella no lo oye a él. Puedes ubicar radios concretos, contar los edificios del entorno con la UIT-R P.2108 y estimar cuántas llamadas esperan canal en la hora pico con Erlang C.',
    ],
    faq: [
      {
        q: '¿Por qué separa la bajada de la subida?',
        a: 'Porque la repetidora transmite con más potencia y antenas más altas que un portátil al cinto. Si solo miras la bajada, el mapa promete cobertura donde el radio no alcanza a la repetidora.',
      },
      {
        q: '¿Qué modelo de propagación usa?',
        a: 'El Irregular Terrain Model (Longley-Rice) v1.4 de NTIA, sin modificaciones, compilado a WebAssembly, sobre el terreno de Terrain Tiles (SRTM). Con "Entorno del equipo" suma la pérdida por edificios de la UIT-R P.2108.',
      },
      ...COMMON_FAQ,
    ],
  },
  lora: {
    h1: 'Simulador de cobertura LoRaWAN de un gateway sobre terreno',
    about: [
      'Calcula la cobertura de un gateway LoRaWAN en AU915 (Colombia), US915 o EU868 sobre el relieve real con el modelo ITM (Longley-Rice) de NTIA. Muestra la bajada, la subida, el desbalance entre las dos y el SF más rápido con el que llega cada punto, con su tiempo en el aire.',
      'Con figura de ruido de 4 dB, el gateway oye SF12 en canales de 125 kHz hasta −139,0 dBm. En AU915, si la red limita cada mensaje a 400 ms, con 11 bytes la subida solo puede usar hasta SF10. Puedes pegar la lista de tus medidores, contar los edificios con la UIT-R P.2108 y ver qué parte de los mensajes choca en el aire (ALOHA).',
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
      ...COMMON_FAQ,
    ],
  },
  celular: {
    h1: 'Simulador de cobertura celular LTE y 5G por sectores',
    about: [
      'Calcula la señal (RSRP), el mejor sector y la interferencia (SINR) de un sitio celular con varios sectores, de 700 a 3500 MHz, con el patrón de la antena y su inclinación. Puedes elegir el modelo: Okumura-Hata / COST-231 para entornos urbanos, suburbanos o rurales, 3GPP 38.901 para macroceldas urbanas, o ITM sobre el terreno real.',
      'Sirve para ver hasta dónde llega un sitio, dónde se solapan los sectores y cómo cambia la cobertura al mover la inclinación o la altura de las antenas.',
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
      ...COMMON_FAQ,
    ],
  },
  interiores: {
    h1: 'Simulador de cobertura WiFi en interiores con planos',
    about: [
      'Dibuja el plano de una casa, un apartamento o una oficina con sus muros y materiales, ubica los access points y mira el mapa de calor de la señal a 2,4, 5 y 6 GHz. Cada muro resta según su material y la frecuencia, con el modelo multipared COST-231.',
      'Sirve para decidir cuántos access points hacen falta y dónde ponerlos antes de instalar, y para ver qué muros dejan zonas sin señal.',
    ],
    faq: [
      {
        q: '¿Por qué 5 GHz llega menos lejos que 2,4 GHz?',
        a: 'Porque pierde más en espacio libre y, sobre todo, al atravesar muros de ladrillo y concreto. A cambio tiene más canales y menos interferencia.',
      },
      {
        q: '¿Puedo guardar el plano?',
        a: 'Sí: "Guardar proyecto" descarga un archivo .json con el plano y todos sus ajustes, y "Abrir proyecto" lo vuelve a cargar en otro equipo.',
      },
      ...COMMON_FAQ,
    ],
  },
  enlace: {
    h1: 'Simulador de radioenlaces y microondas punto a punto',
    about: [
      'Traza el perfil del terreno entre dos puntos, revisa el despeje de la primera zona de Fresnel con la curvatura de la Tierra y calcula el nivel recibido, el margen de desvanecimiento y la disponibilidad de un radioenlace VHF/UHF o de microondas.',
      'Por ejemplo, a 6 GHz y 20 km la primera zona de Fresnel mide 15,8 m de radio en la mitad del trayecto; el criterio usual es dejar libre al menos el 60 % de ella.',
    ],
    faq: [
      {
        q: '¿Qué es la zona de Fresnel?',
        a: 'El elipsoide alrededor de la línea de vista por donde viaja la mayor parte de la energía. Si el terreno o un edificio la invade, el enlace pierde señal aunque haya línea de vista.',
      },
      {
        q: '¿Qué modelos usa?',
        a: 'Espacio libre, difracción por aristas (Deygout) e ITM sobre el perfil real; la disponibilidad se estima con Vigants-Barnett.',
      },
      ...COMMON_FAQ,
    ],
  },
  radiodifusion: {
    h1: 'Simulador de cobertura de emisoras FM y AM',
    about: [
      'Calcula la intensidad de campo en dBµV/m de una emisora y sus zonas de servicio urbana, suburbana y rural. FM se calcula con ITM sobre el relieve real; AM con onda de tierra, según la conductividad del suelo.',
      'Sirve para estimar hasta dónde llega una emisora antes de pedir la licencia o cambiar la antena.',
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
      ...COMMON_FAQ,
    ],
  },
  cavernas: {
    h1: 'Simulador de radio en túneles, minas y cavernas',
    about: [
      'Dibuja las galerías de una mina, un túnel vial o una caverna y simula la señal de radios, repetidores y cable radiante a lo largo de cada galería, con las pérdidas en curvas y cruces.',
      'Un túnel se comporta como una guía de onda (modelo de Emslie): las frecuencias altas avanzan mejor en tramos rectos y las bajas, como VHF, se atenúan rápido en galerías pequeñas. Por eso bajo tierra se usa cable radiante.',
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
