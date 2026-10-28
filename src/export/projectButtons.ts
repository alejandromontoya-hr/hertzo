// Del navegador: botones "Guardar proyecto" y "Abrir proyecto" de los simuladores con editor.

import { saveFile } from './download';
import { parseProject, projectFileName, projectJson, type ProjectScenario } from './projectFile';

export const PROJECT_BUTTONS_HTML = `
  <div class="button-row">
    <button type="button" class="button" data-project-save title="Descarga un archivo .json con todo lo que tienes en la página">Guardar proyecto</button>
    <button type="button" class="button" data-project-open title="Abre un archivo .json guardado con Hertzo">Abrir proyecto</button>
  </div>
  <p class="hint" data-project-message role="status" hidden></p>`;

export interface ProjectBinding<T> {
  scenario: ProjectScenario;
  /** Los datos de la página tal como están ahora. */
  collect(): unknown;
  /** Revisa los datos de un archivo; null si no sirven. */
  read(data: unknown): T | null;
  /** Pone los datos en la página (solo se llama si el archivo es válido). */
  apply(data: T): void;
}

/** Conecta los botones de `PROJECT_BUTTONS_HTML`, que deben estar dentro de `root`. */
export function bindProjectButtons<T>(root: HTMLElement, binding: ProjectBinding<T>): void {
  const message = root.querySelector<HTMLElement>('[data-project-message]')!;
  const show = (text: string) => {
    message.hidden = false;
    message.textContent = text;
  };

  root.querySelector('[data-project-save]')!.addEventListener('click', () => {
    const now = new Date();
    const fileName = projectFileName(binding.scenario, now);
    saveFile(new TextEncoder().encode(projectJson(binding.scenario, binding.collect(), now)), fileName, 'application/json');
    show(`Guardado: ${fileName}`);
  });

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // permite volver a abrir el mismo archivo
    if (!file) return;
    const result = parseProject(await file.text(), binding.scenario, binding.read);
    if (!result.ok) return show(result.message);
    binding.apply(result.data);
    show(`Abierto: ${file.name}`);
  });
  root.querySelector('[data-project-open]')!.addEventListener('click', () => input.click());
}
