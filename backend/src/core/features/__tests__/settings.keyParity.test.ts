/**
 * Guards that every settings key the WebView can write is one the backend
 * accepts.
 *
 * `validateSetting` rejects anything missing from `DEFAULT_SETTINGS` with
 * "Unknown settings key", and the WebView silently falls back to localStorage
 * on that error. The result is a control that appears to work — the UI reacts —
 * but never persists, and reverts on the next read. Issue #267 shipped exactly
 * that: `syncIdeTheme` was added to the WebView's SettingKey enum and left out
 * of the backend, so the checkbox never stayed checked.
 *
 * Nothing else catches this: the two enums live in separate packages with no
 * shared type, so TypeScript sees no mismatch, and unit tests on either side
 * pass in isolation. Hence this cross-package read of both sources.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const backendSettings = resolve(here, '../settings.ts');
const webviewSettings = resolve(here, '../../../../../webview/src/types/settings.ts');

/** String values of the WebView's `SettingKey` enum — the wire keys it sends. */
function webviewSettingKeys(): string[] {
  const src = readFileSync(webviewSettings, 'utf-8');
  const block = /export enum SettingKey \{([\s\S]*?)\n\}/.exec(src);
  if (!block) throw new Error('SettingKey enum not found in webview settings.ts');
  const keys = [...block[1].matchAll(/^\s*[A-Z0-9_]+\s*=\s*['"]([^'"]+)['"]/gm)].map(m => m[1]);
  if (keys.length === 0) throw new Error('parsed zero SettingKey members');
  return keys;
}

/** Keys the backend accepts, i.e. the ones present in DEFAULT_SETTINGS. */
function backendDefaultKeys(): string[] {
  const src = readFileSync(backendSettings, 'utf-8');
  const block = /const DEFAULT_SETTINGS[^{]*\{([\s\S]*?)\n\};/.exec(src);
  if (!block) throw new Error('DEFAULT_SETTINGS not found in backend settings.ts');
  const keys = [...block[1].matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map(m => m[1]);
  if (keys.length === 0) throw new Error('parsed zero DEFAULT_SETTINGS keys');
  return keys;
}

describe('settings key parity (webview ↔ backend)', () => {
  it('accepts every key the WebView can send', () => {
    const backend = new Set(backendDefaultKeys());
    const missing = webviewSettingKeys().filter(k => !backend.has(k));

    expect(
      missing,
      `These SettingKey values are missing from the backend's DEFAULT_SETTINGS, so ` +
        `saving them fails with "Unknown settings key" and the setting silently ` +
        `never persists: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('documents every accepted key in COMMENT_MAP', () => {
    // The settings file is written with these comments; a key without one ships
    // an undocumented entry into the user's ~/.claude-code-gui/settings.json.
    const src = readFileSync(backendSettings, 'utf-8');
    const block = /const COMMENT_MAP[^{]*\{([\s\S]*?)\n\};/.exec(src);
    if (!block) throw new Error('COMMENT_MAP not found in backend settings.ts');
    const documented = new Set(
      [...block[1].matchAll(/^ {2}([A-Za-z0-9_]+):/gm)].map(m => m[1]),
    );
    const undocumented = backendDefaultKeys().filter(k => !documented.has(k));

    expect(undocumented, `keys missing a COMMENT_MAP entry: ${undocumented.join(', ')}`)
      .toEqual([]);
  });
});
