// Genera las imágenes de public/ que no se dibujan en la página:
// - og.png (1200 × 630): la vista previa al compartir un enlace en WhatsApp, LinkedIn o X.
// - apple-touch-icon.png (180 × 180): el ícono al guardar el sitio en la pantalla de inicio del iPhone.
//
// Uso (Node 22.18 o superior, con Edge o Chrome instalado):
//   node docs/marca/generar-imagen-compartir.mjs
// Dibuja una página HTML con la misma letra y la carta de muestra de la portada y le toma una
// foto con el navegador sin ventana. Si cambia el texto de la portada, se vuelve a correr.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SAMPLE_MAP_KEY, sampleCoverageMap } from '../../src/ui/sampleMap.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];
const browser = browsers.find(existsSync);
if (!browser) throw new Error('No encontré Edge ni Chrome.');

const font = (pkg, file) => pathToFileURL(join(root, 'node_modules/@fontsource-variable', pkg, 'files', file)).href;
const logo = readFileSync(join(root, 'public/logo.svg'), 'utf8');
const icon = readFileSync(join(root, 'public/favicon.svg'), 'utf8');

const base = `
  @font-face { font-family: Geist; src: url(${font('geist', 'geist-latin-wght-normal.woff2')}); font-weight: 100 900; }
  @font-face { font-family: Geist Mono; src: url(${font('geist-mono', 'geist-mono-latin-wght-normal.woff2')}); font-weight: 100 900; }
  * { box-sizing: border-box; }
  html, body { margin: 0; overflow: hidden; }`;

const card = `<!doctype html><meta charset="utf-8"><style>${base}
  body { width: 1200px; height: 630px; display: flex; gap: 48px; padding: 56px 56px 56px 64px;
         background: #f3f0e7; color: #1f2328; font-family: Geist; }
  .text { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
  .logo svg { width: 190px; height: auto; display: block; }
  .eyebrow { margin: 0 0 22px; font: 500 17px Geist Mono; letter-spacing: .1em; text-transform: uppercase; color: #5d6168; }
  h1 { margin: 0; font-size: 58px; font-weight: 600; line-height: 1.04; letter-spacing: -.04em; }
  .lead { margin: 24px 0 0; font-size: 24px; line-height: 1.45; color: #3d4148; }
  .foot { font: 500 18px Geist Mono; color: #1f5c8c; }
  figure { width: 470px; margin: 0; padding: 18px; background: #fbfaf6; border: 1.5px solid #1f2328; border-radius: 6px;
           display: flex; flex-direction: column; }
  .map { flex: 1; overflow: hidden; background: #f7f4ec; border: 1.5px solid #1f2328; }
  .map svg { display: block; width: 100%; height: 100%; }
  .hero-map-label { font: 10px Geist Mono; fill: #1f2328; }
  figcaption { margin-top: 14px; font: 14px Geist Mono; color: #3d4148; }
  figcaption i { display: inline-block; width: 16px; height: 11px; margin: 0 5px 0 8px; vertical-align: -1px; }
  figcaption i:first-child { margin-left: 0; }
</style>
<div class="text">
  <div class="logo">${logo}</div>
  <div>
    <p class="eyebrow">Simulador abierto de propagación RF</p>
    <h1>Predice la cobertura de tu radio antes de subir a la torre.</h1>
    <p class="lead">Terreno real, bajada y subida por separado, todo en tu navegador.</p>
  </div>
  <div class="foot">hertzo.site · gratis y de código abierto</div>
</div>
<figure>
  <div class="map">${sampleCoverageMap()}</div>
  <figcaption>${SAMPLE_MAP_KEY}</figcaption>
</figure>`;

const touchIcon = `<!doctype html><meta charset="utf-8"><style>${base}
  body { width: 180px; height: 180px; background: #0b0b10; }
  svg { display: block; width: 180px; height: 180px; }
</style>${icon.replace('rx="14"', 'rx="0"')}`;

const work = mkdtempSync(join(tmpdir(), 'hertzo-img-'));
try {
  for (const [name, html, [w, h]] of [
    ['og.png', card, [1200, 630]],
    ['apple-touch-icon.png', touchIcon, [180, 180]],
  ]) {
    const page = join(work, `${name}.html`);
    writeFileSync(page, html);
    execFileSync(browser, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--user-data-dir=${join(work, 'perfil')}`,
      `--window-size=${w},${h}`,
      `--screenshot=${join(root, 'public', name)}`,
      pathToFileURL(page).href,
    ]);
    console.log(`public/${name} (${w} × ${h})`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
