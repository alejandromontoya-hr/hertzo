import { describe, expect, it } from 'vitest';
import { parseDraft } from './draft';

describe('lo guardado en el navegador', () => {
  it('el sitio "Cerro El Volador" en 800 MHz vuelve igual que se guardó', () => {
    const draft = { search: '?banda=800&entorno=urbano', data: { v: 1, s: [6.2627, -75.5806], n: 'Cerro El Volador', r: 30 }, fromLink: false };
    expect(parseDraft(JSON.stringify({ v: 1, ...draft }))).toEqual(draft);
  });

  it('sin ajustes en la dirección también sirve, y sin "fromLink" cuenta como tuyo', () => {
    expect(parseDraft('{"v":1,"search":"","data":{"v":1}}')).toEqual({ search: '', data: { v: 1 }, fromLink: false });
  });

  it('lo que vino de un enlace se recuerda como tal', () => {
    expect(parseDraft('{"v":1,"search":"","data":{"v":1},"fromLink":true}')?.fromLink).toBe(true);
  });

  it('lo guardado en la versión 1 se abre cuando Hertzo ya va en la 2, con su versión para el lector', () => {
    const raw = '{"v":1,"search":"?banda=uhf","data":{"n":"Mi sitio UHF","r":25}}';
    expect(parseDraft(raw, 2)).toEqual({ search: '?banda=uhf', data: { n: 'Mi sitio UHF', r: 25, v: 1 }, fromLink: false });
  });

  it('lo guardado por una versión más nueva no se abre (queda de respaldo, no se lee mal)', () => {
    expect(parseDraft('{"v":2,"search":"","data":{"n":"Mi sitio UHF"}}', 1)).toBeNull();
  });

  it('una versión que no es un entero desde 1 no se abre', () => {
    for (const v of ['0', '1.5', '"1"', 'null']) expect(parseDraft(`{"v":${v},"search":"","data":{}}`)).toBeNull();
  });

  it('nada guardado, texto dañado, de otra versión o con otra forma: no abre nada', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('{"v":1,"search":"?banda=800","data":')).toBeNull();
    expect(parseDraft('{"v":2,"search":"?banda=800","data":{}}')).toBeNull();
    expect(parseDraft('{"search":"?banda=800","data":{}}')).toBeNull();
    expect(parseDraft('{"v":1,"search":"?banda=800"}')).toBeNull();
    expect(parseDraft('{"v":1,"search":"?banda=800","data":[1,2]}')).toBeNull();
    expect(parseDraft('{"v":1,"search":"banda=800","data":{}}')).toBeNull();
    expect(parseDraft('"Cerro El Volador"')).toBeNull();
  });
});
