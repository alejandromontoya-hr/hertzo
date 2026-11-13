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
