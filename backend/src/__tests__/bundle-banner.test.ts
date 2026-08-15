import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The banner esbuild prepends to every bundle declares symbols in the SAME
 * top-level scope as the bundled module bodies. When a bundled module imports a
 * name the banner already declares, the bundle dies at parse time with
 * "Identifier 'X' has already been declared" — before the backend can print its
 * PORT line, so the IDE only sees "exited before printing PORT".
 *
 * Nothing else catches this: `pnpm dev` runs src/server.ts through tsx and never
 * touches the bundle, so the whole browser-side dev loop stays green while the
 * shipped artifact is unloadable. It first bit us when core/extend-kit.ts
 * imported `createRequire`, which the banner also declared.
 *
 * Hence the convention this test enforces: every banner import is aliased under
 * a `__ccg` prefix, which no source module can collide with.
 */
describe('esbuild banner', () => {
  const banner = readFileSync(
    join(__dirname, '..', '..', 'esbuild.mjs'),
    'utf-8',
  );

  const bannerImports = [...banner.matchAll(/`import \{([^}]+)\} from '[^']+';`/g)]
    .flatMap(([, clause]) => clause.split(','))
    .map((spec) => spec.trim())
    .filter(Boolean);

  it('declares at least one import, so the assertions below are not vacuous', () => {
    expect(bannerImports.length).toBeGreaterThan(0);
  });

  it.each(bannerImports)('aliases `%s` under the __ccg prefix', (spec) => {
    const localName = spec.includes(' as ') ? spec.split(' as ')[1].trim() : spec;
    expect(localName).toMatch(/^__ccg/);
  });
});
