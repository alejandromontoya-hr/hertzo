// Sección "Equipos" del panel: equipos concretos (medidores, sensores, radios) ubicados con
// clic en el mapa o pegados de una lista, con una fila por equipo y un punto en el mapa del
// color de su estado. La página dice qué columnas muestra y cómo se evalúa cada equipo.

import { Marker } from 'maplibre-gl';
import { BALANCE_LEGEND } from '../coverage/colorScale';
import { parseDeviceList, type DeviceStatus } from '../devices/devices';
import type { LonLat } from '../geo/geodesy';
import type { KmlPlacemark } from '../export/kml';
import type { MapPage } from '../pages/shared/mapPage';
import { formatLonLat } from './format';
import { infoButton } from './infoTip';

export interface Device {
  id: number;
  name: string;
  position: LonLat;
  /** Perfil propio del equipo; null usa el elegido en el panel. */
  profileId: string | null;
}

export interface DeviceRow {
  /** Un texto por columna, en el orden de `columns`. */
  cells: string[];
  status: DeviceStatus;
  /** Texto del globo al pasar sobre el punto del mapa. */
  detail: string;
}

export interface DeviceListOptions {
  /** Encabezados de las columnas de resultados, por ejemplo ["Bajada", "Subida", "SF"]. */
  columns: string[];
  /** Unidad de cada columna ("dBm", "dB" o ""), para el CSV y la ficha de Google Earth. */
  units: string[];
  /** Cómo se llama el equipo en plural y en singular: "medidores" / "medidor". */
  noun: { one: string; many: string };
  /** Nombre del perfil para mostrarlo en la fila. */
  profileName(profileId: string | null): string;
  /** Busca el perfil escrito en la lista pegada (por id o por nombre); null si no lo reconoce. */
  matchProfile(text: string): string | null;
  /** Evalúa un equipo; null si todavía no se puede (por ejemplo, sin sitio). */
  evaluate(device: Device): Promise<DeviceRow | null>;
  /** Nombre del archivo CSV, sin extensión. */
  fileName(): string;
  /** Avisa cuántos equipos hay cada vez que se agregan o se quitan. */
  onCountChange?(count: number): void;
}

export interface DeviceList {
  /** Vuelve a evaluar todos los equipos (cambió el sitio, la banda, la potencia...). */
  refresh(): void;
  /** Un punto por equipo, con el color de su estado y su ficha, para el KMZ. */
  placemarks(): KmlPlacemark[];
  destroy(): void;
}

const STATUS: Record<DeviceStatus, { color: string; label: string }> = {
  both: { color: BALANCE_LEGEND.find((e) => e.cls === 'both')!.color, label: 'Llegan las dos' },
  talkOutOnly: { color: BALANCE_LEGEND.find((e) => e.cls === 'talkOutOnly')!.color, label: 'Solo bajada' },
  talkInOnly: { color: BALANCE_LEGEND.find((e) => e.cls === 'talkInOnly')!.color, label: 'Solo subida' },
  none: { color: '#d73027', label: 'No llega' },
  unknown: { color: '#8a8a8a', label: 'Sin cálculo' },
};

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createDeviceList(page: MapPage, container: HTMLElement, options: DeviceListOptions): DeviceList {
  container.innerHTML = `
    <div class="device-actions">
      <button type="button" class="button" data-device-pick aria-pressed="false">Agregar en el mapa</button>
      <button type="button" class="button" data-device-paste aria-expanded="false">Pegar lista</button>
    </div>
    <div class="device-paste" hidden>
      <label for="lista-equipos">Una línea por equipo: nombre, latitud, longitud y, si quieres, el tipo${infoButton(
        'Puedes copiar las columnas desde Excel o pegar un CSV. Ejemplo: "Medidor 12; 6,2442; -75,5812; medidor-caja". Sin tipo, usa el elegido arriba.',
      )}</label>
      <textarea id="lista-equipos" rows="5" placeholder="Medidor 1&#9;6,2442&#9;-75,5812"></textarea>
      <button type="button" class="button" data-device-load>Cargar</button>
      <p class="field-error" data-device-errors hidden></p>
    </div>
    <p class="hint" data-device-summary></p>
    <table class="budget device-table" hidden>
      <thead><tr><th></th>${options.columns.map((c) => `<th>${c}</th>`).join('')}<th></th></tr></thead>
      <tbody></tbody>
    </table>
    <div class="device-actions" data-device-footer hidden>
      <button type="button" class="button" data-device-csv>Descargar CSV</button>
      <button type="button" class="button" data-device-clear>Borrar todos</button>
    </div>`;

  const q = <T extends HTMLElement>(s: string) => container.querySelector<T>(s)!;
  const pickButton = q<HTMLButtonElement>('[data-device-pick]');
  const pasteButton = q<HTMLButtonElement>('[data-device-paste]');
  const pasteBox = q('.device-paste');
  const textarea = q<HTMLTextAreaElement>('textarea');
  const errorsBox = q('[data-device-errors]');
  const summary = q('[data-device-summary]');
  const table = q('table');
  const body = q('tbody');
  const footer = q('[data-device-footer]');

  let devices: Device[] = [];
  let rows = new Map<number, DeviceRow | null>();
  let nextId = 1;
  let picking = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const markers = new Map<number, Marker>();

  const setPicking = (active: boolean) => {
    picking = active;
    pickButton.setAttribute('aria-pressed', String(active));
    pickButton.textContent = active ? 'Listo' : 'Agregar en el mapa';
    page.map.getCanvas().style.cursor = active ? 'crosshair' : '';
  };

  const onMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
    if (!picking) return;
    add([{ name: `${capitalize(options.noun.one)} ${nextId}`, position: { lon: event.lngLat.lng, lat: event.lngLat.lat }, profileId: null }]);
  };
  page.map.on('click', onMapClick);

  pickButton.addEventListener('click', () => setPicking(!picking));
  pasteButton.addEventListener('click', () => {
    pasteBox.hidden = !pasteBox.hidden;
    pasteButton.setAttribute('aria-expanded', String(!pasteBox.hidden));
    if (!pasteBox.hidden) textarea.focus();
  });
  q('[data-device-load]').addEventListener('click', () => {
    const parsed = parseDeviceList(textarea.value);
    errorsBox.hidden = parsed.errors.length === 0;
    errorsBox.textContent = parsed.errors.join(' ');
    add(parsed.devices.map((d) => ({ name: d.name, position: d.position, profileId: d.profile ? options.matchProfile(d.profile) : null })));
    if (parsed.devices.length > 0 && parsed.errors.length === 0) {
      textarea.value = '';
      pasteBox.hidden = true;
      pasteButton.setAttribute('aria-expanded', 'false');
    }
  });
  q('[data-device-clear]').addEventListener('click', () => {
    devices = [];
    rows = new Map();
    for (const m of markers.values()) m.remove();
    markers.clear();
    render();
  });
  q('[data-device-csv]').addEventListener('click', downloadCsv);
  body.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (button) remove(Number(button.dataset.remove));
    const name = (event.target as HTMLElement).closest<HTMLElement>('[data-fly]');
    if (name) {
      const device = devices.find((d) => d.id === Number(name.dataset.fly));
      if (device) page.map.flyTo({ center: [device.position.lon, device.position.lat], zoom: Math.max(page.map.getZoom(), 14) });
    }
  });

  function add(list: Omit<Device, 'id'>[]) {
    for (const d of list) {
      const device = { ...d, id: nextId++ };
      devices.push(device);
      const element = document.createElement('div');
      element.className = 'device-dot';
      const marker = new Marker({ element }).setLngLat([device.position.lon, device.position.lat]).addTo(page.map);
      markers.set(device.id, marker);
    }
    render();
    refresh();
  }

  function remove(id: number) {
    devices = devices.filter((d) => d.id !== id);
    rows.delete(id);
    markers.get(id)?.remove();
    markers.delete(id);
    render();
  }

  let lastCount = 0;

  function render() {
    if (devices.length !== lastCount) {
      lastCount = devices.length;
      options.onCountChange?.(devices.length);
    }
    table.hidden = devices.length === 0;
    footer.hidden = devices.length === 0;
    body.innerHTML = devices
      .map((d) => {
        const row = rows.get(d.id);
        const status = row ? STATUS[row.status] : undefined;
        const cells = row ? row.cells : options.columns.map(() => '…');
        return `<tr>
          <th scope="row"><span class="status-dot" style="background:${status?.color ?? 'transparent'}" title="${status?.label ?? 'Calculando'}"></span>
            <button type="button" class="link-button" data-fly="${d.id}">${escape(d.name)}</button>
            <small>${escape(options.profileName(d.profileId))}</small></th>
          ${cells.map((c) => `<td>${c}</td>`).join('')}
          <td><button type="button" class="link-button" data-remove="${d.id}" aria-label="Quitar ${escape(d.name)}">×</button></td>
        </tr>`;
      })
      .join('');
    for (const d of devices) {
      const row = rows.get(d.id);
      const element = markers.get(d.id)?.getElement();
      if (!element) continue;
      element.style.background = row ? STATUS[row.status].color : STATUS.unknown.color;
      element.title = row ? `${d.name}\n${row.detail}` : d.name;
    }
    showSummary();
  }

  function showSummary() {
    if (devices.length === 0) {
      summary.textContent = `Ubica ${options.noun.many} en el mapa o pega su lista para ver si a cada uno le llega la señal.`;
      return;
    }
    const done = devices.map((d) => rows.get(d.id)).filter((r): r is DeviceRow => !!r);
    if (done.length < devices.length) {
      summary.textContent = `Calculando ${done.length} de ${devices.length}…`;
      return;
    }
    const ok = done.filter((r) => r.status === 'both').length;
    summary.textContent = `${ok} de ${devices.length} ${devices.length === 1 ? options.noun.one : options.noun.many}: llegan bajada y subida.`;
  }

  /** Evalúa de a uno, en orden; si algo cambia mientras tanto, empieza de nuevo. */
  function refresh() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const current = ++generation;
      rows = new Map();
      render();
      for (const device of [...devices]) {
        let row: DeviceRow | null;
        try {
          row = await options.evaluate(device);
        } catch (error) {
          console.error(error);
          row = { cells: options.columns.map(() => '—'), status: 'unknown', detail: 'No se pudo descargar el terreno.' };
        }
        if (current !== generation) return;
        if (!row) {
          summary.textContent = 'Ubica el sitio para calcular los equipos.';
          return;
        }
        rows.set(device.id, row);
        render();
      }
    }, 250);
  }

  function downloadCsv() {
    const quote = (text: string) => `"${text.replace(/"/g, '""').replace(/−/g, '-')}"`;
    const header = ['Nombre', 'Tipo', 'Latitud', 'Longitud', ...options.columns.map(withUnit), 'Estado'];
    const lines = devices.map((d) => {
      const row = rows.get(d.id);
      return [
        d.name,
        options.profileName(d.profileId),
        String(d.position.lat).replace('.', ','),
        String(d.position.lon).replace('.', ','),
        ...(row ? row.cells : options.columns.map(() => '')),
        row ? STATUS[row.status].label : '',
      ]
        .map(quote)
        .join(';');
    });
    // BOM para que Excel abra las tildes bien; punto y coma y coma decimal, como Excel en español.
    const blob = new Blob(['﻿' + [header.map(quote).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${options.fileName()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function placemarks(): KmlPlacemark[] {
    return devices.map((d) => {
      const row = rows.get(d.id);
      const status = row ? STATUS[row.status] : STATUS.unknown;
      return {
        name: d.name,
        position: d.position,
        color: status.color,
        tables: [
          {
            rows: [
              ['Estado', status.label],
              ['Tipo', options.profileName(d.profileId)],
              ...options.columns.map((c, i) => [c, row ? cellWithUnit(row.cells[i]!, options.units[i]!) : '—']),
              ['Ubicación (lat, lon)', formatLonLat(d.position.lon, d.position.lat)],
            ],
            note: row?.detail,
          },
        ],
      };
    });
  }

  const withUnit = (column: string, i: number) => (options.units[i] ? `${column} (${options.units[i]})` : column);

  render();

  return {
    refresh,
    placemarks,
    destroy() {
      clearTimeout(timer);
      generation++;
      page.map.off('click', onMapClick);
      for (const m of markers.values()) m.remove();
    },
  };
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "-106" con "dBm" → "-106 dBm"; "SF7" o "—" quedan igual. */
const cellWithUnit = (cell: string, unit: string) => (unit && /\d$/.test(cell) ? `${cell} ${unit}` : cell);
