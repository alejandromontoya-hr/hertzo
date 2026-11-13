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
import { createHoverReadout } from './hoverReadout';
import { LOCATE_ICON } from './icons';
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
  /** A qué distancia del sitio está, por ejemplo "A 0,2 km del gateway"; va en el globo y en el KMZ. */
  detail: string;
}

export interface DeviceListOptions {
  /** Encabezados de las columnas de resultados, por ejemplo ["Bajada", "Subida", "SF"]. */
  columns: string[];
  /** Unidad de cada columna ("dBm", "dB" o ""), para el CSV y la ficha de Google Earth. */
  units: string[];
  /** Cómo se llama el equipo en plural y en singular: "medidores" / "medidor". */
  noun: { one: string; many: string };
  /** Perfiles que se pueden elegir para un equipo, en el menú de su fila. */
  profiles: readonly { id: string; name: string }[];
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
  /** Avisa cada vez que termina de evaluar un equipo. */
  onRowsChange?(): void;
  /** Equipos con que abre la página (los de un enlace compartido). */
  initial?: Omit<Device, 'id'>[];
}

export interface DeviceList {
  /** Vuelve a evaluar todos los equipos (cambió el sitio, la banda, la potencia...). */
  refresh(): void;
  /** Un punto por equipo, con el color de su estado y su ficha, para el KMZ. */
  placemarks(): KmlPlacemark[];
  /** Los equipos de la lista, en orden. */
  devices(): Device[];
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
      <textarea id="lista-equipos" rows="5" placeholder="${capitalize(options.noun.one)} 1&#9;6,2442&#9;-75,5812"></textarea>
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

  const onMapClick = (event: { lngLat: { lng: number; lat: number }; originalEvent: MouseEvent }) => {
    if (!picking) return;
    // Un clic sobre un equipo (o al soltarlo tras arrastrarlo) no agrega otro encima.
    if (isOverDevice(event.originalEvent)) return;
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
    const items = parsed.devices.map((d) => ({ name: d.name, position: d.position, profileId: d.profile ? options.matchProfile(d.profile) : null }));
    // Un tipo que no coincide con ningún perfil no se cambia en silencio por el de arriba: se avisa.
    const unknown = parsed.devices
      .filter((d, i) => d.profile && items[i]!.profileId === null)
      .map((d) => `"${d.name}": el tipo "${d.profile}" no coincide con ningún perfil (${options.profiles.map((p) => p.name).join(', ')}); se calcula como el de arriba.`);
    const messages = [...parsed.errors, ...unknown];
    errorsBox.hidden = messages.length === 0;
    errorsBox.textContent = messages.join(' ');
    add(items);
    if (parsed.devices.length > 0 && parsed.errors.length === 0) {
      textarea.value = '';
      pasteBox.hidden = true;
      pasteButton.setAttribute('aria-expanded', 'false');
    }
  });
  q('[data-device-clear]').addEventListener('click', () => {
    for (const d of [...devices]) remove(d.id);
  });
  q('[data-device-csv]').addEventListener('click', downloadCsv);

  /** Elementos de la fila de cada equipo: se crean una vez, así escribir el nombre no se interrumpe. */
  interface RowElements {
    tr: HTMLTableRowElement;
    dot: HTMLElement;
    sameOption: HTMLOptionElement;
    cells: HTMLTableCellElement[];
  }
  const rowElements = new Map<number, RowElements>();

  function createRow(device: Device): RowElements {
    const tr = document.createElement('tr');
    const profileOptions = options.profiles.map((p) => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
    tr.innerHTML = `
      <th scope="row">
        <div class="device-name"><span class="status-dot" role="img"></span><input type="text" maxlength="60" aria-label="Nombre del ${options.noun.one}"></div>
        <select class="device-type" aria-label="Tipo de ${escape(device.name)}"><option value=""></option>${profileOptions}</select>
      </th>
      ${options.columns.map(() => '<td></td>').join('')}
      <td class="device-row-actions">
        <button type="button" class="device-locate" data-fly title="Ver en el mapa" aria-label="Ver ${escape(device.name)} en el mapa">${LOCATE_ICON}</button>
        <button type="button" class="link-button" data-remove title="Quitar" aria-label="Quitar ${escape(device.name)}">×</button>
      </td>`;
    const input = tr.querySelector('input')!;
    const select = tr.querySelector('select')!;
    input.value = device.name;
    select.value = device.profileId ?? '';
    input.addEventListener('change', () => {
      device.name = input.value.trim() || device.name;
      input.value = device.name;
      render();
    });
    select.addEventListener('change', () => {
      device.profileId = select.value || null;
      reevaluate(device.id);
    });
    tr.querySelector('[data-fly]')!.addEventListener('click', () =>
      page.map.flyTo({ center: [device.position.lon, device.position.lat], zoom: Math.max(page.map.getZoom(), 14) }),
    );
    tr.querySelector('[data-remove]')!.addEventListener('click', () => remove(device.id));
    return {
      tr,
      dot: tr.querySelector('.status-dot')!,
      sameOption: select.options[0]!,
      cells: [...tr.querySelectorAll('td')].slice(0, options.columns.length),
    };
  }

  function add(list: Omit<Device, 'id'>[]) {
    for (const d of list) {
      const device: Device = { ...d, id: nextId++ };
      devices.push(device);
      // Punto con el nombre al lado: el ancla queda en el centro del punto, no del conjunto.
      const element = document.createElement('div');
      element.className = 'device-marker';
      element.innerHTML = '<span class="device-dot"></span><span class="device-label"></span>';
      element.addEventListener('mouseenter', (event) => showReadout(device, event));
      element.addEventListener('mousemove', (event) => showReadout(device, event));
      element.addEventListener('mouseleave', () => readout.hide());
      // Se arrastra para moverlo; al soltarlo se vuelve a calcular solo ese equipo.
      const marker = new Marker({ element, draggable: true, anchor: 'left', offset: [-DOT_RADIUS_PX, 0] })
        .setLngLat([device.position.lon, device.position.lat])
        .addTo(page.map);
      marker.on('dragstart', () => readout.hide());
      marker.on('drag', scheduleLabels);
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        device.position = { lon: lng, lat };
        reevaluate(device.id);
      });
      markers.set(device.id, marker);
      const row = createRow(device);
      rowElements.set(device.id, row);
      body.append(row.tr);
    }
    render();
    schedule(false);
  }

  function remove(id: number) {
    devices = devices.filter((d) => d.id !== id);
    rows.delete(id);
    markers.get(id)?.remove();
    markers.delete(id);
    rowElements.get(id)?.tr.remove();
    rowElements.delete(id);
    render();
    options.onRowsChange?.();
  }

  /** Cambió un equipo (lo moviste o le cambiaste el tipo): se calcula de nuevo solo ese. */
  function reevaluate(id: number) {
    rows.delete(id);
    render();
    schedule(false);
  }

  const readout = createHoverReadout(page.readoutRoot);

  /** Globo del equipo, igual al de la lectura del mapa: nombre, estado, tipo y cada columna. */
  function showReadout(device: Device, event: MouseEvent) {
    const row = rows.get(device.id);
    const status = row ? STATUS[row.status] : undefined;
    const lines = [
      device.name,
      `${status?.label ?? 'Calculando…'} · ${options.profileName(device.profileId)}`,
      ...(row ? options.columns.map((c, i) => `${c}: ${cellWithUnit(row.cells[i]!, options.units[i]!)}`) : []),
      ...(row ? [row.detail] : []),
    ];
    const box = page.readoutRoot.parentElement!.getBoundingClientRect();
    readout.show(lines, event.clientX - box.left, event.clientY - box.top);
  }

  // Un nombre se muestra solo si cabe sin pisar otro nombre ni otro punto; los equipos de
  // arriba en la lista tienen prioridad. Se recalcula al mover el mapa, una vez por cuadro.
  let labelFrame = 0;
  const scheduleLabels = () => {
    if (!labelFrame) labelFrame = requestAnimationFrame(layoutLabels);
  };
  function layoutLabels() {
    labelFrame = 0;
    const items = devices.flatMap((d) => {
      const element = markers.get(d.id)?.getElement();
      return element ? [{ dot: element.querySelector('.device-dot')!, label: element.querySelector<HTMLElement>('.device-label')! }] : [];
    });
    // Primero se miden todos y después se esconden: medir y cambiar alternados es lento con cientos.
    const dots = items.map((i) => i.dot.getBoundingClientRect());
    const labels = items.map((i) => i.label.getBoundingClientRect());
    const placed: DOMRect[] = [];
    const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    const visible = labels.map((rect, i) => {
      const free = !placed.some((p) => overlaps(rect, p)) && !dots.some((d, j) => j !== i && overlaps(rect, d));
      if (free) placed.push(rect);
      return free;
    });
    items.forEach((item, i) => item.label.classList.toggle('device-label-hidden', !visible[i]));
  }
  page.map.on('move', scheduleLabels);

  let lastCount = 0;

  function render() {
    if (devices.length !== lastCount) {
      lastCount = devices.length;
      options.onCountChange?.(devices.length);
    }
    table.hidden = devices.length === 0;
    footer.hidden = devices.length === 0;
    for (const d of devices) {
      const row = rows.get(d.id);
      const status = row ? STATUS[row.status] : undefined;
      const elements = rowElements.get(d.id)!;
      elements.dot.style.background = status?.color ?? 'transparent';
      elements.dot.setAttribute('aria-label', status?.label ?? 'Calculando');
      elements.sameOption.textContent = `${options.profileName(null)} · como arriba`;
      elements.cells.forEach((cell, i) => (cell.innerHTML = row ? row.cells[i]! : '…'));
      const element = markers.get(d.id)?.getElement();
      if (!element) continue;
      element.querySelector<HTMLElement>('.device-dot')!.style.background = row ? STATUS[row.status].color : STATUS.unknown.color;
      element.querySelector('.device-label')!.textContent = d.name;
    }
    scheduleLabels();
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

  let fullPending = false;

  /** Todo cambió (el sitio, la banda, la potencia...): se vuelven a evaluar todos los equipos. */
  function refresh() {
    schedule(true);
  }

  /**
   * Evalúa de a uno, en orden, los equipos que no tienen resultado (todos si `full`); si algo
   * cambia mientras tanto, empieza de nuevo.
   */
  function schedule(full: boolean) {
    fullPending ||= full;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const current = ++generation;
      if (fullPending) rows = new Map();
      fullPending = false;
      render();
      for (const device of devices.filter((d) => !rows.has(d.id))) {
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
        if (!devices.includes(device)) continue;
        rows.set(device.id, row);
        render();
        options.onRowsChange?.();
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
  if (options.initial?.length) add(options.initial);

  return {
    refresh,
    placemarks,
    devices: () => [...devices],
    destroy() {
      clearTimeout(timer);
      generation++;
      page.map.off('click', onMapClick);
      page.map.off('move', scheduleLabels);
      cancelAnimationFrame(labelFrame);
      readout.hide();
      for (const m of markers.values()) m.remove();
    },
  };
}

/** Radio del punto del equipo en el mapa (14 px de diámetro). */
const DOT_RADIUS_PX = 7;

/** El cursor está sobre un equipo del mapa: la lectura de cobertura no debe tapar su globo. */
export function isOverDevice(event: MouseEvent): boolean {
  return !!(event.target as Element | null)?.closest?.('.device-marker');
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "-106" con "dBm" → "-106 dBm"; "SF7" o "—" quedan igual. */
const cellWithUnit = (cell: string, unit: string) => (unit && /\d$/.test(cell) ? `${cell} ${unit}` : cell);
