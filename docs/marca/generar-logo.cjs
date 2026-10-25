// Genera el logo de Hertzo: «hertz» en Geist Mono Medium convertido a trazos + el aro de Hertz
// calzado en la celda exacta de la «o» (mismo ancho de avance, mismo contorno, mismo grosor).
//
// Uso (las dependencias no son del proyecto; se instalan aparte):
//   npm install --prefix <carpeta-deps> opentype.js@1.3.4 geist@1.3.1
//   node docs/marca/generar-logo.cjs <carpeta-deps> <carpeta-salida>
// Escribe logo.svg (fondo claro), logo-oscuro.svg (fondo oscuro) y favicon.svg (ícono).
const path = require("path");
const fs = require("fs");
const deps = process.argv[2];
const outDir = process.argv[3];
const opentype = require(path.join(deps, "node_modules", "opentype.js"));
const font = opentype.loadSync(path.join(deps, "node_modules", "geist", "dist", "fonts", "geist-mono", "GeistMono-Medium.ttf"));

const SIZE = 100, s = SIZE / font.unitsPerEm, f = (v) => +v.toFixed(2);
const o = font.charToGlyph("o"), h = font.charToGlyph("h");
const adv = o.advanceWidth * s;

// Grosor del trazo de la «o»: distancia entre el contorno exterior y el interior a la izquierda
const contours = [];
let cur = [];
for (const c of o.path.commands) {
  if (c.type === "M" && cur.length) { contours.push(cur); cur = []; }
  if (c.x !== undefined) cur.push([c.x, c.y]);
}
if (cur.length) contours.push(cur);
const boxes = contours.map((pts) => ({ xMin: Math.min(...pts.map((p) => p[0])), yMax: Math.max(...pts.map((p) => p[1])) }));
boxes.sort((a, b) => a.xMin - b.xMin);
const sw = (boxes[1].xMin - boxes[0].xMin) * s;

const ob = o.getBoundingBox(), hb = h.getBoundingBox();
const baseline = hb.y2 * s;                          // y de la línea base con el borde superior en 0
const x0 = 5 * adv;                                   // la «o» es la sexta celda
const oxMin = x0 + ob.x1 * s, oxMax = x0 + ob.x2 * s;
const oyTop = baseline - ob.y2 * s, oyBot = baseline - ob.y1 * s;
const cx = (oxMin + oxMax) / 2, cy = (oyTop + oyBot) / 2;
const rx = (oxMax - oxMin) / 2 - sw / 2, ry = (oyBot - oyTop) / 2 - sw / 2;
const P = (d) => [cx + rx * Math.cos((d * Math.PI) / 180), cy - ry * Math.sin((d * Math.PI) / 180)];
const a = P(118), b = P(-8), rb = sw * 0.64;

function zig(a, b, r0, amp, ks = [-0.8, 1, -0.9, 0.5]) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = [-u[1], u[0]];
  const st = [a[0] + u[0] * r0, a[1] + u[1] * r0], en = [b[0] - u[0] * r0, b[1] - u[1] * r0];
  let d = `M${f(st[0])} ${f(st[1])}`;
  ks.forEach((k, i) => {
    const t = (i + 1) / (ks.length + 1);
    d += ` L${f(st[0] + (en[0] - st[0]) * t + n[0] * k * amp)} ${f(st[1] + (en[1] - st[1]) * t + n[1] * k * amp)}`;
  });
  return d + ` L${f(en[0])} ${f(en[1])}`;
}

const text = font.getPath("hertz", 0, baseline, SIZE).toPathData(2);
const left = hb.x1 * s, right = Math.max(oxMax, b[0] + rb), bottom = Math.max(oyBot, baseline);
const vb = `${f(left)} 0 ${f(right - left)} ${f(bottom)}`;
const ring = `M${f(a[0])} ${f(a[1])} A${f(rx)} ${f(ry)} 0 1 0 ${f(b[0])} ${f(b[1])}`;
const spark = zig(a, b, rb + sw * 0.3, sw * 0.42, [-1, 1, -1, 1, -1]);

const inner = (ink, sp) =>
  `<path fill="${ink}" d="${text}"/>` +
  `<path d="${ring}" fill="none" stroke="${ink}" stroke-width="${f(sw)}" stroke-linecap="round"/>` +
  `<circle cx="${f(a[0])}" cy="${f(a[1])}" r="${f(rb)}" fill="${ink}"/><circle cx="${f(b[0])}" cy="${f(b[1])}" r="${f(rb)}" fill="${ink}"/>` +
  `<path d="${spark}" fill="none" stroke="${sp}" stroke-width="${f(sw * 0.34)}" stroke-linecap="round" stroke-linejoin="round"/>`;

fs.writeFileSync(path.join(outDir, "logo.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="hertzo">${inner("#15141a", "#1f5c8c")}</svg>\n`);
fs.writeFileSync(path.join(outDir, "logo-oscuro.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="hertzo">${inner("#f2f1ee", "#7fb3d9")}</svg>\n`);

// Ícono: el aro redondo (el resonador original) sobre fondo negro
const g = (R, gap, mid, c) => { const Q = (d) => [c + R * Math.cos((d * Math.PI) / 180), c - R * Math.sin((d * Math.PI) / 180)]; return [Q(mid + gap), Q(mid - gap)]; };
const [ia, ib] = g(19, 40, 52, 32), isw = 6.4, irb = 5.4;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b10"/>` +
  `<path d="M${f(ia[0])} ${f(ia[1])} A19 19 0 1 0 ${f(ib[0])} ${f(ib[1])}" fill="none" stroke="#f2f1ee" stroke-width="${isw}" stroke-linecap="round"/>` +
  `<circle cx="${f(ia[0])}" cy="${f(ia[1])}" r="${irb}" fill="#f2f1ee"/><circle cx="${f(ib[0])}" cy="${f(ib[1])}" r="${irb}" fill="#f2f1ee"/>` +
  `<path d="${zig(ia, ib, irb + 2, 2.6)}" fill="none" stroke="#7fb3d9" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
fs.writeFileSync(path.join(outDir, "favicon.svg"), icon);
console.log(JSON.stringify({ adv: f(adv), sw: f(sw), vb }));



