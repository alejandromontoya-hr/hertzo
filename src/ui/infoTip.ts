// Botón "i" con su explicación en un globo, para no llenar el panel de texto. El globo vive en
// el <body> con posición fija: así no lo recorta el panel cuando tiene barra de desplazamiento.
// Se abre al pasar el mouse o al enfocar el botón con el teclado; en pantallas táctiles, al tocarlo.

const TOOLTIP_ID = 'info-tooltip';
const GAP_PX = 6;
const MARGIN_PX = 8;

const escapeAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * Botón "i"; `text` es la explicación (puede cambiarse después con `setInfo`). `attrs` agrega
 * atributos para encontrarlo, por ejemplo `data-choice-info="banda"`.
 */
export function infoButton(text = '', attrs = ''): string {
  return `<button type="button" class="info-tip" data-info="${escapeAttr(text)}" aria-label="Más información"${attrs ? ` ${attrs}` : ''}${text ? '' : ' hidden'}>i</button>`;
}

/** Cambia la explicación de un botón "i", por ejemplo al elegir otra banda. */
export function setInfo(button: HTMLElement, text: string): void {
  button.dataset.info = text;
  button.hidden = text === '';
  if (current === button) show(button);
}

let tooltip: HTMLElement | null = null;
let current: HTMLElement | null = null;
/** Abierto con un toque o un clic: no se cierra al sacar el mouse. */
let pinned = false;

function show(button: HTMLElement) {
  const text = button.dataset.info ?? '';
  if (!tooltip || !text) return hide();
  current = button;
  tooltip.textContent = text;
  tooltip.hidden = false;
  button.setAttribute('aria-describedby', TOOLTIP_ID);
  button.setAttribute('aria-expanded', 'true');

  // Debajo del botón, alineado a su izquierda; arriba si no cabe, y siempre dentro de la ventana.
  const b = button.getBoundingClientRect();
  const t = tooltip.getBoundingClientRect();
  const left = Math.min(Math.max(MARGIN_PX, b.left), window.innerWidth - t.width - MARGIN_PX);
  const below = b.bottom + GAP_PX;
  const top = below + t.height > window.innerHeight - MARGIN_PX ? b.top - GAP_PX - t.height : below;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(MARGIN_PX, top)}px`;
}

function hide() {
  if (tooltip) tooltip.hidden = true;
  current?.removeAttribute('aria-describedby');
  current?.setAttribute('aria-expanded', 'false');
  current = null;
  pinned = false;
}

const infoTarget = (event: Event) => (event.target as HTMLElement | null)?.closest?.<HTMLElement>('.info-tip') ?? null;

/** Una sola vez, al arrancar la app: escucha todos los botones "i" de cualquier página. */
export function installInfoTips(): void {
  tooltip = document.createElement('div');
  tooltip.id = TOOLTIP_ID;
  tooltip.className = 'info-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.append(tooltip);

  document.addEventListener('pointerover', (event) => {
    const button = infoTarget(event);
    if (button && (event as PointerEvent).pointerType === 'mouse' && !pinned) show(button);
  });
  document.addEventListener('pointerout', (event) => {
    if (infoTarget(event) && (event as PointerEvent).pointerType === 'mouse' && !pinned) hide();
  });
  document.addEventListener('focusin', (event) => {
    const button = infoTarget(event);
    if (button && !pinned) show(button);
  });
  document.addEventListener('focusout', (event) => {
    if (infoTarget(event) && !pinned) hide();
  });
  document.addEventListener('click', (event) => {
    const button = infoTarget(event);
    if (button) {
      // Que el clic no llegue a la etiqueta ni al campo que la rodea.
      event.preventDefault();
      if (pinned && current === button) return hide();
      show(button);
      pinned = true;
    } else if (pinned) {
      hide();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && current) hide();
  });
  // Con el panel desplazándose o la ventana cambiando de tamaño, el globo quedaría suelto.
  document.addEventListener('scroll', () => current && hide(), true);
  window.addEventListener('resize', () => current && hide());
}
