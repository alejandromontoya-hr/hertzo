// Catálogo de escenarios de la portada: qué simula cada página y sus variantes.

export interface ScenarioOption {
  label: string;
  /** Ruta completa con sus parámetros, por ejemplo "#/terreno?banda=uhf". */
  href: string;
}

export interface Scenario {
  path: string;
  title: string;
  summary: string;
  /** Qué calcula, en una línea. */
  computes: string;
  model: string;
  icon: string;
  options: ScenarioOption[];
}

const svg = (body: string) =>
  `<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const SCENARIOS: Scenario[] = [
  {
    path: 'terreno',
    title: 'Radiocomunicaciones en terreno',
    summary: 'Trunking P25, SmartZone y convencional sobre el terreno real.',
    computes: 'Bajada, subida y desbalance de un sitio, con su balance de enlace.',
    model: 'ITM (Longley-Rice) de NTIA sobre terreno SRTM',
    icon: svg('<path d="M24 20v22M18 42h12M24 20l-6 22M24 20l6 22"/><circle cx="24" cy="16" r="3"/><path d="M15 9a13 13 0 0 0 0 14M33 9a13 13 0 0 1 0 14M19 12a7 7 0 0 0 0 8M29 12a7 7 0 0 1 0 8"/>'),
    options: [
      { label: 'VHF', href: '#/terreno?banda=vhf' },
      { label: 'UHF', href: '#/terreno?banda=uhf' },
      { label: '700 MHz', href: '#/terreno?banda=700' },
      { label: '800 MHz', href: '#/terreno?banda=800' },
    ],
  },
  {
    path: 'radiodifusion',
    title: 'Radiodifusión FM y AM',
    summary: 'Emisoras sobre el terreno: intensidad de campo y zonas de servicio.',
    computes: 'Campo en dBµV/m y contornos de servicio urbano, suburbano y rural.',
    model: 'FM con ITM sobre terreno; AM con onda de tierra (Sommerfeld-Norton)',
    icon: svg('<rect x="8" y="18" width="32" height="22" rx="3"/><circle cx="30" cy="29" r="5"/><path d="M13 25h8M13 30h8M13 35h8M14 18 32 8"/>'),
    options: [
      { label: 'FM', href: '#/radiodifusion?servicio=fm' },
      { label: 'AM', href: '#/radiodifusion?servicio=am' },
    ],
  },
  {
    path: 'celular',
    title: 'Celular (LTE / 5G)',
    summary: 'Un sitio con sectores: señal, mejor sector e interferencia entre sectores.',
    computes: 'RSRP, mejor sector y SINR, con patrón de antena e inclinación.',
    model: 'Okumura-Hata / COST-231, 3GPP 38.901 o ITM con terreno',
    icon: svg('<rect x="16" y="6" width="16" height="36" rx="3"/><path d="M21 37h6"/><path d="M8 14a14 14 0 0 1 0 14M40 14a14 14 0 0 0 0 14"/>'),
    options: [
      { label: '700 MHz', href: '#/celular?banda=700' },
      { label: '850 MHz', href: '#/celular?banda=850' },
      { label: '1900 MHz', href: '#/celular?banda=1900' },
      { label: 'AWS', href: '#/celular?banda=aws' },
      { label: '2600 MHz', href: '#/celular?banda=2600' },
      { label: '3500 MHz', href: '#/celular?banda=3500' },
    ],
  },
  {
    path: 'enlace',
    title: 'Enlaces punto a punto',
    summary: 'Microondas y radioenlaces: perfil, zona de Fresnel y margen.',
    computes: 'Despeje de Fresnel, pérdidas, nivel recibido, margen de desvanecimiento y disponibilidad.',
    model: 'Espacio libre + difracción por aristas (Deygout) e ITM; Vigants-Barnett',
    icon: svg('<path d="M6 30a8 8 0 0 1 8-12l-4 12z"/><path d="M42 30a8 8 0 0 0-8-12l4 12z"/><path d="M10 30v10M38 30v10M16 22h16"/><path d="M20 18l-4 4 4 4M28 18l4 4-4 4"/>'),
    options: [
      { label: 'Microondas', href: '#/enlace?tipo=microondas' },
      { label: 'Radioenlace VHF/UHF', href: '#/enlace?tipo=radio' },
    ],
  },
  {
    path: 'interiores',
    title: 'Interiores (WiFi)',
    summary: 'Dibuja el plano con muros y materiales, ubica los access points y mira la señal.',
    computes: 'Mapa de calor de señal en cada punto del plano y mejor access point.',
    model: 'Multipared COST-231 con pérdidas por material a 2,4, 5 y 6 GHz',
    icon: svg('<path d="M6 22 24 8l18 14"/><path d="M10 19v21h28V19"/><path d="M18 30a9 9 0 0 1 12 0M21 34a4 4 0 0 1 6 0"/><circle cx="24" cy="37" r="0.8" fill="currentColor"/>'),
    options: [
      { label: 'Casa', href: '#/interiores?plano=casa' },
      { label: 'Apartamento', href: '#/interiores?plano=apartamento' },
      { label: 'Oficina', href: '#/interiores?plano=oficina' },
    ],
  },
  {
    path: 'cavernas',
    title: 'Cavernas, túneles y minas',
    summary: 'Dibuja las galerías y simula radios, repetidores y cable radiante bajo tierra.',
    computes: 'Señal a lo largo de cada galería, curvas, cruces y tramos sin cobertura.',
    model: 'Túnel como guía de onda (Emslie), pérdidas en curvas y cable radiante',
    icon: svg('<path d="M4 40V26C4 14 13 6 24 6s20 8 20 20v14"/><path d="M14 40V28a10 10 0 0 1 20 0v12"/><path d="M4 40h40"/>'),
    options: [
      { label: 'Mina', href: '#/cavernas?escenario=mina' },
      { label: 'Túnel vial', href: '#/cavernas?escenario=tunel' },
      { label: 'Cueva', href: '#/cavernas?escenario=cueva' },
    ],
  },
];
