import { describe, it, expect } from 'vitest';
import { normalizeSettingValue, PATH_SETTING_KEYS } from '../path-settings';

describe('normalizeSettingValue', () => {
  it('drops the trailing space that made spawn fail with ENOENT (#446)', () => {
    expect(normalizeSettingValue('cliPath', '/home/deth/.local/bin/claude ')).toBe(
      '/home/deth/.local/bin/claude',
    );
  });

  it('drops leading whitespace and newlines a paste can carry', () => {
    expect(normalizeSettingValue('cliPath', '  /usr/bin/claude\n')).toBe('/usr/bin/claude');
  });

  it('turns a path that is only whitespace into null, not a blank string', () => {
    // A blank string is truthy-adjacent trouble: "   " passes every `|| null` guard
    // in the spawn path and would be handed to spawn verbatim.
    expect(normalizeSettingValue('cliPath', '   ')).toBeNull();
    expect(normalizeSettingValue('cliPath', '')).toBeNull();
  });

  it('normalizes every path-valued setting, not just cliPath', () => {
    for (const key of PATH_SETTING_KEYS) {
      expect(normalizeSettingValue(key, '/some/path ')).toBe('/some/path');
    }
  });

  it('covers the four path settings a user types by hand', () => {
    expect([...PATH_SETTING_KEYS].sort()).toEqual([
      'cliPath',
      'nodePath',
      'openFilesWith',
      'terminalApp',
    ]);
  });

  it('leaves non-path settings alone, whitespace and all', () => {
    // Trimming these would silently rewrite user data that is not a path.
    expect(normalizeSettingValue('theme', ' dark ')).toBe(' dark ');
    expect(normalizeSettingValue('logLevel', 'info ')).toBe('info ');
  });

  it('passes non-string values through untouched', () => {
    expect(normalizeSettingValue('cliPath', null)).toBeNull();
    expect(normalizeSettingValue('fontSize', 13)).toBe(13);
  });
});

describe('normalizeSettingValue — the custom file opener', () => {
  it('trims the path inside the opener object', () => {
    expect(
      normalizeSettingValue('openFilesWithCustom', { path: ' /usr/bin/code ', arguments: '-g' }),
    ).toEqual({ path: '/usr/bin/code', arguments: '-g' });
  });

  it('leaves the argument template exactly as the user wrote it', () => {
    // Spacing inside a command line is the user's, not ours to edit.
    expect(
      normalizeSettingValue('openFilesWithCustom', { path: '/usr/bin/code', arguments: ' -n -w %TARGET_PATH% ' }),
    ).toEqual({ path: '/usr/bin/code', arguments: ' -n -w %TARGET_PATH% ' });
  });

  it('drops the whole opener when its path is only whitespace', () => {
    // An opener with no path cannot open anything; null is "no custom opener".
    expect(normalizeSettingValue('openFilesWithCustom', { path: '   ', arguments: '-g' })).toBeNull();
  });

  it('passes through a null or malformed opener without inventing a shape', () => {
    expect(normalizeSettingValue('openFilesWithCustom', null)).toBeNull();
    const noPath = { arguments: '-g' };
    expect(normalizeSettingValue('openFilesWithCustom', noPath)).toBe(noPath);
  });
});
