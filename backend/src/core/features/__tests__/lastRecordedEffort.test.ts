import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { readLastRecordedEffort } from '../lastRecordedEffort';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

const mockSessionsPath = vi.mocked(getProjectSessionsPath);

function assistant(uuid: string, effort?: string, perTurnEffort?: string) {
  return {
    type: 'assistant',
    uuid,
    ...(effort !== undefined ? { effort } : {}),
    ...(perTurnEffort !== undefined ? { perTurnEffort } : {}),
    message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  };
}

const user = (uuid: string) => ({ type: 'user', uuid, message: { role: 'user', content: 'hi' } });

async function writeSession(entries: unknown[]): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'ccg-last-effort-'));
  await writeFile(join(dir, 'sid.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  mockSessionsPath.mockResolvedValue(dir);
}

describe('readLastRecordedEffort', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the level the last response ran at, with the CLI fields untouched', async () => {
    await writeSession([user('u1'), assistant('a1', 'high', 'high')]);
    expect(await readLastRecordedEffort('sid', '/repo')).toEqual({ uuid: 'a1', effort: 'high', perTurnEffort: 'high' });
  });

  it('reports the newest response when the level changed between turns', async () => {
    await writeSession([
      user('u1'), assistant('a1', 'medium', 'medium'),
      user('u2'), assistant('a2', 'xhigh', 'xhigh'),
    ]);
    expect((await readLastRecordedEffort('sid', '/repo'))?.effort).toBe('xhigh');
  });

  it('is not fooled by entries that follow the response', async () => {
    await writeSession([assistant('a1', 'low', 'low'), user('u2'), { type: 'system', subtype: 'stop_hook_summary' }]);
    expect((await readLastRecordedEffort('sid', '/repo'))?.uuid).toBe('a1');
  });

  it('keeps effort and perTurnEffort apart when they differ', async () => {
    await writeSession([assistant('a1', 'max', 'high')]);
    expect(await readLastRecordedEffort('sid', '/repo')).toEqual({ uuid: 'a1', effort: 'max', perTurnEffort: 'high' });
  });

  it('says nothing for a response from a CLI that wrote no level, rather than reaching back to an older turn', async () => {
    await writeSession([assistant('a1', 'low', 'low'), user('u2'), assistant('a2')]);
    expect(await readLastRecordedEffort('sid', '/repo')).toBeNull();
  });

  it('says nothing when the session file is not there', async () => {
    mockSessionsPath.mockResolvedValue(join(tmpdir(), 'ccg-no-such-dir-effort'));
    expect(await readLastRecordedEffort('sid', '/repo')).toBeNull();
  });
});
