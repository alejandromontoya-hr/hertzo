// Catálogo de escenarios de la portada: qué simula cada página y sus variantes.

export interface ScenarioOption {
  label: string;
  /** Dirección completa con sus parámetros, por ejemplo "/terreno?banda=uhf". */
  href: string;
}

export interface Scenario {
  path: string;
  title: string;
  /** Título de la pestaña y de Google, sin « | Hertzo»; con las palabras que la gente busca. */
  pageTitle: string;
  /** Descripción para Google y la vista previa al compartir: unos 150 caracteres. */
  description: string;
  summary: string;
  /** Qué calcula, en una línea. */
  computes: string;
  model: string;
  options: ScenarioOption[];
}

export const SCENARIOS: Scenario[] = [
  {
    path: 'terreno',
    title: 'Radiocomunicaciones en terreno',
    pageTitle: 'Cobertura de radio P25 y trunking sobre terreno',
    description:
      'Bajada y subida de un sitio VHF, UHF, 700 u 800 MHz sobre el terreno real con ITM (Longley-Rice) y su balance de enlace. Gratis, en tu navegador.',
    summary: 'Trunking P25, SmartZone y convencional sobre el terreno real.',
    computes: 'Bajada, subida y desbalance de un sitio, con su balance de enlace.',
    model: 'ITM (Longley-Rice) de NTIA sobre terreno SRTM',
    options: [
      { label: 'VHF', href: '/terreno?banda=vhf' },
      { label: 'UHF', href: '/terreno?banda=uhf' },
      { label: '700 MHz', href: '/terreno?banda=700' },
      { label: '800 MHz', href: '/terreno?banda=800' },
    ],
  },
  {
    path: 'radiodifusion',
    title: 'Radiodifusión FM y AM',
    pageTitle: 'Cobertura de emisoras FM y AM',
    description:
      'Intensidad de campo en dBµV/m y zonas de servicio de una emisora: FM con ITM sobre el terreno real y AM con onda de tierra. Gratis, en tu navegador.',
    summary: 'Emisoras sobre el terreno: intensidad de campo y zonas de servicio.',
    computes: 'Campo en dBµV/m y contornos de servicio urbano, suburbano y rural.',
    model: 'FM con ITM sobre terreno; AM con onda de tierra (Sommerfeld-Norton)',
    options: [
      { label: 'FM', href: '/radiodifusion?servicio=fm' },
      { label: 'AM', href: '/radiodifusion?servicio=am' },
    ],
  },
  {
    path: 'celular',
    title: 'Celular (LTE / 5G)',
    pageTitle: 'Cobertura celular LTE y 5G por sectores',
    description:
      'RSRP, mejor sector y SINR de un sitio con sectores de 700 a 3500 MHz, con Okumura-Hata, 3GPP 38.901 o ITM sobre el terreno. Gratis, en tu navegador.',
    summary: 'Un sitio con sectores: señal, mejor sector e interferencia entre sectores.',
    computes: 'RSRP, mejor sector y SINR, con patrón de antena e inclinación.',
    model: 'Okumura-Hata / COST-231, 3GPP 38.901 o ITM con terreno',
    options: [
      { label: '700 MHz', href: '/celular?banda=700' },
      { label: '850 MHz', href: '/celular?banda=850' },
      { label: '1900 MHz', href: '/celular?banda=1900' },
      { label: 'AWS', href: '/celular?banda=aws' },
      { label: '2600 MHz', href: '/celular?banda=2600' },
      { label: '3500 MHz', href: '/celular?banda=3500' },
    ],
  },
  {
    path: 'enlace',
    title: 'Enlaces punto a punto',
    pageTitle: 'Radioenlaces y microondas punto a punto',
    description:
      'Perfil del trayecto, despeje de la zona de Fresnel, nivel recibido, margen de desvanecimiento y disponibilidad de un enlace. Gratis, en tu navegador.',
    summary: 'Microondas y radioenlaces: perfil, zona de Fresnel y margen.',
    computes: 'Despeje de Fresnel, pérdidas, nivel recibido, margen de desvanecimiento y disponibilidad.',
    model: 'Espacio libre + difracción por aristas (Deygout) e ITM; Vigants-Barnett',
    options: [
      { label: 'Microondas', href: '/enlace?tipo=microondas' },
      { label: 'Radioenlace VHF/UHF', href: '/enlace?tipo=radio' },
    ],
  },
  {
    path: 'interiores',
    title: 'Interiores (WiFi)',
    pageTitle: 'Cobertura WiFi en interiores con planos',
    description:
      'Dibuja el plano con muros y materiales, ubica los access points y mira el mapa de calor de la señal a 2,4, 5 y 6 GHz. Gratis, en tu navegador.',
    summary: 'Dibuja el plano con muros y materiales, ubica los access points y mira la señal.',
    computes: 'Mapa de calor de señal en cada punto del plano y mejor access point.',
    model: 'Multipared COST-231 con pérdidas por material a 2,4, 5 y 6 GHz',
    options: [
      { label: 'Casa', href: '/interiores?plano=casa' },
      { label: 'Apartamento', href: '/interiores?plano=apartamento' },
      { label: 'Oficina', href: '/interiores?plano=oficina' },
    ],
  },
  {
    path: 'cavernas',
    title: 'Cavernas, túneles y minas',
    pageTitle: 'Radio en túneles, minas y cavernas',
    description:
      'Señal de radios, repetidores y cable radiante a lo largo de galerías, curvas y cruces bajo tierra. Gratis, en tu navegador.',
    summary: 'Dibuja las galerías y simula radios, repetidores y cable radiante bajo tierra.',
    computes: 'Señal a lo largo de cada galería, curvas, cruces y tramos sin cobertura.',
    model: 'Túnel como guía de onda (Emslie), pérdidas en curvas y cable radiante',
    options: [
      { label: 'Mina', href: '/cavernas?escenario=mina' },
      { label: 'Túnel vial', href: '/cavernas?escenario=tunel' },
      { label: 'Cueva', href: '/cavernas?escenario=cueva' },
    ],
  },
];

/** Dirección del selector de escenarios (la raíz / queda para la página principal del sitio). */
export const CHOOSER_PATH = 'escenarios';

/** Todas las direcciones de la app: el selector y una por escenario. */
export const APP_PATHS: readonly string[] = [CHOOSER_PATH, ...SCENARIOS.map((s) => s.path)];
