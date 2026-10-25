// Le avisa a Bing (y a los demás buscadores de IndexNow: Yandex, Seznam, Naver) que las páginas
// de hertzo.site cambiaron, para que no esperen días o semanas a volver a pasar por el sitio.
// Se corre a mano cuando Vercel termina de publicar: npm run indexnow
//
// La clave no es secreta: IndexNow la pide publicada en el sitio (public/<clave>.txt) para
// comprobar que el aviso viene del dueño del dominio.
const HOST = 'hertzo.site';
const BASE = `https://${HOST}`;
const KEY = 'ab293eeae81f7d740bece16c431aab1d';
const KEY_LOCATION = `${BASE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const RESPUESTAS = {
  200: 'recibidas',
  202: 'recibidas, Bing todavía está validando la clave',
  400: 'el aviso está mal armado',
  403: 'Bing no encontró la clave publicada o no coincide',
  422: 'hay direcciones que no son de hertzo.site',
  429: 'demasiados avisos seguidos, espera un rato',
};

async function leerSitemap() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`No se pudo leer el sitemap publicado (HTTP ${res.status}).`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length === 0) throw new Error('El sitemap publicado no trae direcciones.');
  return urls;
}

async function comprobarClave() {
  const res = await fetch(KEY_LOCATION);
  const texto = res.ok ? (await res.text()).trim() : '';
  if (texto !== KEY) {
    throw new Error(`La clave no está publicada en ${KEY_LOCATION}. Publica el sitio antes de avisarle a Bing.`);
  }
}

async function main() {
  const urls = await leerSitemap();
  await comprobarClave();

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
  });

  const detalle = RESPUESTAS[res.status] ?? (await res.text());
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow respondió ${res.status}: ${detalle}.`);
  }
  console.log(`${urls.length} direcciones enviadas a IndexNow: ${detalle}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
