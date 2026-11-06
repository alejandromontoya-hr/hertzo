// Que los documentos del repositorio no se queden atrás de la app: si se agrega una página o un
// ícono y el README, docs/ESCENARIOS.md o THIRD_PARTY.md no lo nombran, esta prueba falla.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCENARIOS } from '../pages/scenarios';
import { PAGES } from './seo';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const readme = read('README.md');
const escenarios = read('docs/ESCENARIOS.md');
const thirdParty = read('THIRD_PARTY.md');
const icons = read('src/ui/icons.ts');

describe('README.md', () => {
  it('nombra la dirección de cada escenario', () => {
    for (const s of SCENARIOS) expect(readme, s.path).toContain(`\`/${s.path}\``);
  });

  it('cuenta bien las páginas del sitemap', () => {
    expect(readme).toContain(`trae las ${PAGES.length} páginas`);
  });
});

describe('docs/ESCENARIOS.md', () => {
  it('describe cada escenario con su dirección', () => {
    for (const s of SCENARIOS) expect(escenarios, s.path).toContain(`\`/${s.path}`);
  });
});

describe('THIRD_PARTY.md', () => {
  it('nombra cada ícono de Lucide que usa la app', () => {
    const used = [...icons.matchAll(/lucide-static\/icons\/([a-z-]+)\.svg/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(0);
    for (const icon of used) expect(thirdParty, icon).toContain(`\`${icon}\``);
  });
});
