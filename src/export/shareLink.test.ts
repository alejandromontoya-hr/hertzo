import { describe, expect, it } from 'vitest';
import {
  SHARE_BROKEN_MESSAGE,
  SHARE_VERSION,
  changedFields,
  decodeShare,
  encodeShare,
  positionData,
  readFields,
  readPosition,
  shareCodeFromHash,
  shareHash,
  mailHref,
  whatsappHref,
} from './shareLink';

const POWER = { key: 'powerW', label: 'Potencia', unit: 'W', min: 0, max: 1000, minExclusive: true } as const;
const HEIGHT = { key: 'heightM', label: 'Altura', unit: 'm', min: 0.5, max: 1000 } as const;

describe('encodeShare y decodeShare', () => {
  it('devuelven los mismos datos, con la versión del formato', async () => {
    const data = { s: [6.2627, -75.5806], n: 'Cerro El Volador', tx: { transmitterPowerW: 50 } };
    const code = await encodeShare(data);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodeShare(code)).toEqual({ ok: true, data: { v: SHARE_VERSION, ...data } });
  });

  it('un enlace cortado al copiarlo no abre a medias', async () => {
    const code = await encodeShare({ n: 'Cerro El Volador', e: Array.from({ length: 20 }, (_, i) => [`Portátil ${i}`, 6.2 + i / 100, -75.5]) });
    expect(await decodeShare(code.slice(0, code.length - 10))).toEqual({ ok: false, message: SHARE_BROKEN_MESSAGE });
    expect(await decodeShare('no-es-un-enlace')).toEqual({ ok: false, message: SHARE_BROKEN_MESSAGE });
  });

  it('un enlace de una versión más nueva pide recargar', async () => {
    const code = await encodeShare({ v: SHARE_VERSION + 1 });
    const result = await decodeShare(code);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/versión más nueva/);
  });
});

describe('WhatsApp y correo', () => {
  const title = 'Hertzo · Terreno 800 MHz · Cerro El Volador';
  const url = 'https://hertzo.site/terreno?banda=800&entorno=urbano#d=Jcwx_-';

  it('WhatsApp lleva el título y el enlace en la línea siguiente, con el "#" y el "&" escapados', () => {
    const href = whatsappHref(title, url);
    expect(href).toBe(
      'https://wa.me/?text=Hertzo%20%C2%B7%20Terreno%20800%20MHz%20%C2%B7%20Cerro%20El%20Volador%0Ahttps%3A%2F%2Fhertzo.site%2Fterreno%3Fbanda%3D800%26entorno%3Durbano%23d%3DJcwx_-',
    );
    expect(new URL(href).searchParams.get('text')).toBe(`${title}\n${url}`);
  });

  it('el correo lleva el título de asunto y el enlace completo en el cuerpo', () => {
    const href = mailHref(title, url);
    expect(href.startsWith('mailto:?subject=Hertzo%20%C2%B7%20Terreno')).toBe(true);
    const params = new URLSearchParams(href.slice('mailto:?'.length));
    expect(params.get('subject')).toBe(title);
    expect(params.get('body')).toBe(url);
  });
});

describe('shareCodeFromHash', () => {
  it('lee "#d=…" y deja la puntuación pegada al copiar de un texto', () => {
    expect(shareCodeFromHash(shareHash('aB-_9'))).toBe('aB-_9');
    expect(shareCodeFromHash('#d=aB-_9.')).toBe('aB-_9');
    expect(shareCodeFromHash('#d=aB-_9),')).toBe('aB-_9');
  });

  it('otra dirección no es un enlace compartido', () => {
    expect(shareCodeFromHash('')).toBeNull();
    expect(shareCodeFromHash('#creditos')).toBeNull();
    expect(shareCodeFromHash('#d=')).toBeNull();
  });
});

describe('changedFields', () => {
  it('deja solo lo que cambió: 50 W en vez de 100 W', () => {
    const base = { powerW: 100, heightM: 30 };
    expect(changedFields({ powerW: 50, heightM: 30 }, base)).toEqual({ powerW: 50 });
    expect(changedFields(base, base)).toEqual({});
  });
});

describe('readFields', () => {
  const base = { powerW: 100, heightM: 30 };

  it('pone encima de los valores por omisión los campos que trae', () => {
    expect(readFields({ powerW: 50 }, [POWER, HEIGHT], base)).toEqual({ powerW: 50, heightM: 30 });
    expect(readFields(undefined, [POWER, HEIGHT], base)).toEqual(base);
  });

  it('rechaza un valor que el formulario no aceptaría', () => {
    expect(readFields({ powerW: 0 }, [POWER, HEIGHT], base)).toBeNull(); // debe ser mayor que 0 W
    expect(readFields({ heightM: 0.4 }, [POWER, HEIGHT], base)).toBeNull(); // mínimo 0,5 m
    expect(readFields({ powerW: '50' }, [POWER, HEIGHT], base)).toBeNull();
    expect(readFields([50], [POWER, HEIGHT], base)).toBeNull();
  });
});

describe('coordenadas', () => {
  it('van con 6 decimales (≈ 11 cm), latitud primero', () => {
    expect(positionData({ lat: 6.26273412345, lon: -75.58061298765 })).toEqual([6.262734, -75.580613]);
  });

  it('rechaza una latitud o longitud imposible', () => {
    expect(readPosition([6.2627, -75.5806])).toEqual({ lat: 6.2627, lon: -75.5806 });
    expect(readPosition([91, -75.5806])).toBeNull();
    expect(readPosition([6.2627, -181])).toBeNull();
    expect(readPosition([6.2627])).toBeNull();
  });
});
