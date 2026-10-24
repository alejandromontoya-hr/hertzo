// Escenarios de ejemplo bajo tierra: mina, túnel vial y cueva.

import type { CaveModel, Gallery, Point } from './network';

const pts = (...coords: [number, number][]): Point[] => coords.map(([x, y]) => ({ x, y }));

const gallery = (id: string, name: string, points: Point[], widthM: number, heightM: number): Gallery => ({
  id,
  name,
  points,
  widthM,
  heightM,
});

export interface CavePreset {
  id: string;
  label: string;
  /** Banda que mejor muestra el escenario. */
  band: string;
  rockId: string;
  build: () => CaveModel;
}

/**
 * Mina subterránea: galería principal de 600 m desde la bocamina, cruzadas cada 100 m y una
 * rampa. Repetidor en la bocamina y cable radiante en los primeros 300 m de la principal.
 */
function mine(): CaveModel {
  const crosscuts: Gallery[] = [100, 200, 300, 400, 500].flatMap((x, i) => [
    gallery(`cn${i}`, `Cruzada norte ${i + 1}`, pts([x, 0], [x, -150]), 4.5, 3.5),
    gallery(`cs${i}`, `Cruzada sur ${i + 1}`, pts([x, 0], [x, 90]), 4.5, 3.5),
  ]);
  return {
    galleries: [
      gallery(
        'principal',
        'Galería principal',
        pts([0, 0], [100, 0], [200, 0], [300, 0], [400, 0], [500, 0], [600, 0]),
        5,
        4,
      ),
      ...crosscuts,
      gallery('rampa', 'Rampa', pts([500, -150], [560, -200], [640, -230]), 5, 4.5),
      gallery('nivel', 'Nivel inferior', pts([100, -150], [200, -150], [300, -150], [400, -150], [500, -150]), 4.5, 3.5),
    ],
    transmitters: [{ id: 'rep', name: 'Repetidor en la bocamina', x: 0, y: 0, powerDbm: 40, gainDbi: 3 }],
    cables: [{ id: 'cable', points: pts([5, 0], [300, 0]), headPowerDbm: 33 }],
  };
}

/** Túnel vial de 1,2 km con una curva suave y cable radiante en toda su longitud. */
function roadTunnel(): CaveModel {
  const curve: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const x = i * 100;
    curve.push([x, i <= 5 ? 0 : 0.18 * (x - 500) ** 1.3 / 10]);
  }
  return {
    galleries: [gallery('tunel', 'Túnel', pts(...curve), 10, 7)],
    transmitters: [{ id: 'portal', name: 'Antena en el portal', x: 0, y: 0, powerDbm: 37, gainDbi: 6 }],
    cables: [{ id: 'cable', points: pts(...curve.slice(0, 12).map(([x, y]) => [x + 2, y] as [number, number]), curve[12]!), headPowerDbm: 33 }],
  };
}

/** Cueva natural: pasajes sinuosos de 2 a 6 m, paredes rugosas y un radio portátil en la entrada. */
function cave(): CaveModel {
  return {
    galleries: [
      gallery('entrada', 'Entrada', pts([0, 0], [25, 6], [48, 4], [70, 14]), 6, 5),
      gallery('sala', 'Sala principal', pts([70, 14], [92, 30], [118, 36], [140, 28]), 8, 6),
      gallery('estrecho', 'Paso estrecho', pts([140, 28], [152, 46], [158, 70], [175, 88], [196, 92]), 2.5, 2),
      gallery('rio', 'Galería del río', pts([140, 28], [170, 20], [205, 26], [236, 14], [265, 18]), 4, 3),
      gallery('lateral', 'Galería lateral', pts([92, 30], [88, 58], [100, 80], [96, 104]), 3, 2.5),
    ],
    transmitters: [{ id: 'radio', name: 'Radio en la entrada', x: 0, y: 0, powerDbm: 37, gainDbi: 0 }],
    cables: [],
  };
}

export const CAVE_PRESETS: readonly CavePreset[] = [
  { id: 'mina', label: 'Mina', band: 'uhf', rockId: 'roca', build: mine },
  { id: 'tunel', label: 'Túnel vial', band: 'fm', rockId: 'concreto', build: roadTunnel },
  { id: 'cueva', label: 'Cueva', band: 'vhf', rockId: 'caliza', build: cave },
  { id: 'blanco', label: 'En blanco', band: 'uhf', rockId: 'roca', build: () => ({ galleries: [], transmitters: [], cables: [] }) },
];

export const ROCKS: readonly { id: string; label: string; epsilonR: number; roughnessM: number }[] = [
  { id: 'roca', label: 'Roca dura típica (εr 5, rugosidad 10 cm)', epsilonR: 5, roughnessM: 0.1 },
  { id: 'caliza', label: 'Caliza de cueva natural (εr 8, rugosidad 30 cm)', epsilonR: 8, roughnessM: 0.3 },
  { id: 'carbon', label: 'Carbón (εr 4, rugosidad 10 cm)', epsilonR: 4, roughnessM: 0.1 },
  { id: 'concreto', label: 'Revestimiento de concreto (εr 6, rugosidad 2 cm)', epsilonR: 6, roughnessM: 0.02 },
];

export interface CaveBand {
  id: string;
  label: string;
  frequencyMHz: number;
  /** Potencia típica del equipo que transmite (dBm). */
  txPowerDbm: number;
  /** Sensibilidad típica del receptor (dBm). */
  sensitivityDbm: number;
  description: string;
}

export const CAVE_BANDS: readonly CaveBand[] = [
  { id: 'am', label: 'AM', frequencyMHz: 1, txPowerDbm: 40, sensitivityDbm: -90, description: 'Radio AM (1 MHz): muy por debajo del corte de cualquier galería.' },
  { id: 'fm', label: 'FM', frequencyMHz: 100, txPowerDbm: 30, sensitivityDbm: -95, description: 'Radio FM (100 MHz): por eso los túneles viales la retransmiten por cable radiante.' },
  { id: 'vhf', label: 'VHF', frequencyMHz: 155, txPowerDbm: 37, sensitivityDbm: -116, description: 'Radio portátil VHF (155 MHz), convencional o trunking.' },
  { id: 'uhf', label: 'UHF', frequencyMHz: 460, txPowerDbm: 37, sensitivityDbm: -116, description: 'Radio portátil UHF (460 MHz), la más usada en minería.' },
  { id: '800', label: '800', frequencyMHz: 860, txPowerDbm: 35, sensitivityDbm: -116, description: 'Trunking P25 o SmartZone en 800 MHz.' },
  { id: 'wifi', label: '2,4 GHz', frequencyMHz: 2437, txPowerDbm: 20, sensitivityDbm: -80, description: 'WiFi de 2,4 GHz para datos y telemetría.' },
];
