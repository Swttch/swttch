import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtemp, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { readLastRecordedSend } from '../lastRecordedSend';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

const mockSessionsPath = vi.mocked(getProjectSessionsPath);

/** A prompt the user typed, in the shape the CLI records it. */
function send(uuid: string, text: string, permissionMode = 'bypassPermissions') {
  return {
    type: 'user',
    uuid,
    permissionMode,
    message: { role: 'user', content: text },
  };
}

/**
 * What a `/model` switch writes after a turn, in the exact shape a real session
 * records it. Every one is `type: "user"` with plain string content, which is
 * what made a naive "last user entry" test pick the wrong send.
 *
 * Taken from a measured transcript: the caveat carries `isMeta`, the other two
 * carry no distinguishing field at all, and none of the three is stamped with
 * `permissionMode` — unlike a prompt the user typed.
 */
function modelSwitchEntries(prefix: string) {
  return [
    {
      type: 'user',
      uuid: `${prefix}-caveat`,
      isMeta: true,
      message: { role: 'user', content: '<local-command-caveat>Caveat: The messages below were generated…' },
    },
    {
      type: 'user',
      uuid: `${prefix}-cmd`,
      message: { role: 'user', content: '<command-name>/model</command-name>\n<command-args>sonnet</command-args>' },
    },
    {
      type: 'user',
      uuid: `${prefix}-out`,
      message: { role: 'user', content: '<local-command-stdout>Set model to `sonnet`</local-command-stdout>' },
    },
  ];
}

function toolResult(uuid: string) {
  return {
    type: 'user',
    uuid,
    message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] },
  };
}

function snapshot(messageId: string) {
  return { type: 'file-history-snapshot', messageId, snapshot: { messageId, trackedFileBackups: {} } };
}

async function writeSession(entries: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ccg-last-send-'));
  await writeFile(join(dir, 'sid.jsonl'), entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
  mockSessionsPath.mockResolvedValue(dir);
  return dir;
}

describe('readLastRecordedSend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reports the send the user typed', async () => {
    await writeSession([send('u1', 'Reply with exactly: ALPHA'), snapshot('u1')]);

    const result = await readLastRecordedSend('sid', '/repo');

    expect(result).toEqual({ uuid: 'u1', canRewind: true, text: 'Reply with exactly: ALPHA' });
  });

  // The reason this test exists: a `/model` switch leaves three entries that read
  // as sends, and taking the last of them reported a uuid the user never typed —
  // the actions then went missing on the message they belonged to.
  it('ignores the entries a /model switch leaves behind it', async () => {
    await writeSession([
      send('u1', 'Reply with exactly: ALPHA'),
      snapshot('u1'),
      ...modelSwitchEntries('m1'),
    ]);

    const result = await readLastRecordedSend('sid', '/repo');

    expect(result?.uuid).toBe('u1');
    expect(result?.text).toBe('Reply with exactly: ALPHA');
  });

  it('ignores tool results, which are user entries too', async () => {
    await writeSession([send('u1', 'do the thing'), toolResult('tr1'), snapshot('u1')]);

    expect((await readLastRecordedSend('sid', '/repo'))?.uuid).toBe('u1');
  });

  it('reports the newest send when there are several', async () => {
    await writeSession([
      send('u1', 'first'),
      snapshot('u1'),
      send('u2', 'second'),
      snapshot('u2'),
    ]);

    expect((await readLastRecordedSend('sid', '/repo'))?.uuid).toBe('u2');
  });

  // A session recorded before file checkpointing was on has sends but no
  // snapshots, and the menu has to grey the rewind out rather than fail on it.
  it('says the send cannot be rewound to when no snapshot names it', async () => {
    await writeSession([send('u1', 'no backups here')]);

    expect(await readLastRecordedSend('sid', '/repo')).toMatchObject({
      uuid: 'u1',
      canRewind: false,
    });
  });

  it('is null when the tail holds no send at all', async () => {
    await writeSession([toolResult('tr1'), snapshot('nobody')]);

    expect(await readLastRecordedSend('sid', '/repo')).toBeNull();
  });

  // No turn should fail because a menu could not be populated.
  it('is null rather than throwing when the session file is missing', async () => {
    mockSessionsPath.mockResolvedValue(join(tmpdir(), 'ccg-does-not-exist'));

    expect(await readLastRecordedSend('sid', '/repo')).toBeNull();
  });
});
