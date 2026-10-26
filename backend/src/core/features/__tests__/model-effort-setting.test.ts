import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  canonicalModelName,
  isPersistableEffortLevel,
  saveModelEffortLevel,
} from '../model-effort-setting';

let dir: string;
let previous: string | undefined;

const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const write = (name: string, value: unknown) => writeFileSync(join(dir, name), JSON.stringify(value, null, 2));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'model-effort-'));
  previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
});

afterEach(() => {
  if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = previous;
  rmSync(dir, { recursive: true, force: true });
});

describe('canonicalModelName', () => {
  it.each([
    ['claude-opus-5-5', 'claude-opus-5-5'],
    ['claude-opus-5-5[1m]', 'claude-opus-5-5'],
    ['claude-sonnet-5-5-20260601', 'claude-sonnet-5-5'],
    ['claude-sonnet-5-5-20260601[1m]', 'claude-sonnet-5-5'],
    ['  claude-haiku-5-5 ', 'claude-haiku-5-5'],
  ])('spells %s as %s', (input, expected) => {
    expect(canonicalModelName(input)).toBe(expected);
  });

  it.each([['opus'], ['opusplan'], ['default'], [''], [null], [undefined], ['claude-opus-5-5;rm']])(
    'gives no name for %s, which no modelSettings key could match',
    (input) => {
      expect(canonicalModelName(input as string | null | undefined)).toBeNull();
    },
  );
});

describe('isPersistableEffortLevel', () => {
  it('holds the four levels the settings schema accepts and not max, which it drops on read', () => {
    for (const level of ['low', 'medium', 'high', 'xhigh']) expect(isPersistableEffortLevel(level)).toBe(true);
    expect(isPersistableEffortLevel('max')).toBe(false);
    expect(isPersistableEffortLevel('auto')).toBe(false);
  });
});

describe('saveModelEffortLevel', () => {
  it('creates settings.json with the model entry when there is no file', async () => {
    expect(await saveModelEffortLevel('claude-sonnet-5-5', 'low')).toEqual({ status: 'ok', persisted: true });
    expect(read('settings.json')).toEqual({ modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low' } } });
  });

  it("keeps every other model's level and every other key of the file", async () => {
    write('settings.json', {
      model: 'opusplan',
      env: { A: '1' },
      modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' }, 'claude-sonnet-5-5': { effortLevel: 'low' } },
    });
    await saveModelEffortLevel('claude-sonnet-5-5', 'medium');
    expect(read('settings.json')).toEqual({
      model: 'opusplan',
      env: { A: '1' },
      modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' }, 'claude-sonnet-5-5': { effortLevel: 'medium' } },
    });
  });

  it("keeps the other keys of the model's own entry", async () => {
    write('settings.json', { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high', maxEffortLevel: 'xhigh' } } });
    await saveModelEffortLevel('claude-opus-5-5', 'low');
    expect(read('settings.json').modelSettings['claude-opus-5-5']).toEqual({ effortLevel: 'low', maxEffortLevel: 'xhigh' });
  });

  it('writes under the canonical name when handed a [1m] spelling', async () => {
    await saveModelEffortLevel('claude-opus-5-5[1m]', 'high');
    expect(Object.keys(read('settings.json').modelSettings)).toEqual(['claude-opus-5-5']);
  });

  it('writes into settings.local.json when that file already holds modelSettings, since it wins the merge', async () => {
    write('settings.local.json', { modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } });
    write('settings.json', { model: 'opus' });
    await saveModelEffortLevel('claude-opus-5-5', 'high');
    expect(read('settings.local.json').modelSettings['claude-opus-5-5'].effortLevel).toBe('high');
    expect(read('settings.json')).toEqual({ model: 'opus' });
  });

  it('refuses when settings.local.json cannot be read, instead of writing a value the stale copy would override', async () => {
    writeFileSync(join(dir, 'settings.local.json'), '{ not json');
    const result = await saveModelEffortLevel('claude-opus-5-5', 'high');
    expect(result.status).toBe('error');
    expect(existsSync(join(dir, 'settings.json'))).toBe(false);
  });

  it('removes the level for Auto, and the entry and block when nothing else is left in them', async () => {
    write('settings.json', { model: 'opus', modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low' } } });
    expect(await saveModelEffortLevel('claude-sonnet-5-5', null)).toEqual({ status: 'ok', persisted: true });
    expect(read('settings.json')).toEqual({ model: 'opus' });
  });

  it('removes only the level for Auto when the entry holds other keys or other models remain', async () => {
    write('settings.json', {
      modelSettings: {
        'claude-opus-5-5': { effortLevel: 'high', maxEffortLevel: 'xhigh' },
        'claude-sonnet-5-5': { effortLevel: 'low' },
      },
    });
    await saveModelEffortLevel('claude-opus-5-5', null);
    expect(read('settings.json').modelSettings).toEqual({
      'claude-opus-5-5': { maxEffortLevel: 'xhigh' },
      'claude-sonnet-5-5': { effortLevel: 'low' },
    });
  });

  it('clears Auto from both files, so a leftover in the other one cannot keep answering', async () => {
    write('settings.json', { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'low' } } });
    write('settings.local.json', { modelSettings: { 'claude-sonnet-5-5': { effortLevel: 'high' } } });
    await saveModelEffortLevel('claude-sonnet-5-5', null);
    expect(read('settings.json')).toEqual({});
    expect(read('settings.local.json')).toEqual({});
  });

  it('does not create a file for Auto when there was nothing stored', async () => {
    expect(await saveModelEffortLevel('claude-sonnet-5-5', null)).toEqual({ status: 'ok', persisted: true });
    expect(existsSync(join(dir, 'settings.json'))).toBe(false);
  });

  it('stores nothing for max, which the settings file cannot hold', async () => {
    expect(await saveModelEffortLevel('claude-sonnet-5-5', 'max')).toEqual({ status: 'ok', persisted: false });
    expect(existsSync(join(dir, 'settings.json'))).toBe(false);
  });

  it('stores nothing for an alias or an unknown model, whose pick lasts for the session only', async () => {
    expect(await saveModelEffortLevel('opusplan', 'high')).toEqual({ status: 'ok', persisted: false });
    expect(await saveModelEffortLevel(null, 'high')).toEqual({ status: 'ok', persisted: false });
    expect(existsSync(join(dir, 'settings.json'))).toBe(false);
  });
});
