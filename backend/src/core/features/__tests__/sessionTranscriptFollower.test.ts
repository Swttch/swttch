import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let sessionsDir = '';
vi.mock('../getProjectSessionsPath', () => ({ getProjectSessionsPath: async () => sessionsDir }));

// What the backend that holds the session's CLI says of it. None by default: no other backend runs the session.
let holderSays: { activity?: string; turnStartedAt?: number | null } | undefined;
// What the CLI registry says: undefined follows `holderSays`, the way a holder that answers is also one the registry names.
let registryHolds: boolean | undefined;
vi.mock('../../forward-to-holder', () => ({
  askHolderActivity: async () => holderSays,
  isHeldByAnotherBackend: () => registryHolds ?? holderSays !== undefined,
}));
// Where the other project folders are searched: a folder of its own, never the real one.
let configDir = '';
vi.mock('../claudeConfigDir', () => ({ getClaudeConfigDir: () => configDir }));

let responseAt = 0;
let readAt = 0;
vi.mock('../lastResponseAt', () => ({ lastResponseAt: async () => responseAt }));
vi.mock('../sessionReadLedger', () => ({ lastReadAt: () => readAt }));

import {
  followSessionTranscript,
  resetSessionTranscriptFollowers,
  stopFollowingSessionTranscript,
  watchSessions,
} from '../sessionTranscriptFollower';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';

/**
 * A session can be worked on by a program this backend does not run. The screen that shows it is told when its
 * transcript grows, and the session counts as running for a short while after each growth. A session this
 * backend runs is left alone: its own program streams everything.
 */
describe('followSessionTranscript', () => {
  const FAST = { pollMs: 30, debounceMs: 40, runningGraceMs: 150 };
  let sendTo: ReturnType<typeof vi.fn>;
  let setExternalRunning: ReturnType<typeof vi.fn>;
  let setExternalDone: ReturnType<typeof vi.fn>;
  let getProcess: ReturnType<typeof vi.fn>;
  let setHeldElsewhere: ReturnType<typeof vi.fn>;
  let connections: ConnectionManager;
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const file = () => join(sessionsDir, 'child.jsonl');

  beforeEach(() => {
    sessionsDir = mkdtempSync(join(tmpdir(), 'follow-'));
    writeFileSync(file(), '{"type":"user"}\n');
    sendTo = vi.fn();
    setExternalRunning = vi.fn();
    setExternalDone = vi.fn();
    getProcess = vi.fn().mockReturnValue(null);
    setHeldElsewhere = vi.fn();
    holderSays = undefined;
    registryHolds = undefined;
    configDir = mkdtempSync(join(tmpdir(), 'follow-config-'));
    responseAt = 0;
    readAt = 0;
    connections = { sendTo, setExternalRunning, setExternalDone, getProcess, setHeldElsewhere } as unknown as ConnectionManager;
  });

  afterEach(() => {
    resetSessionTranscriptFollowers();
    rmSync(sessionsDir, { recursive: true, force: true });
    rmSync(configDir, { recursive: true, force: true });
  });

  it('tells the screen when the transcript grows, once for a burst of writes', async () => {
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);

    appendFileSync(file(), '{"type":"assistant"}\n');
    appendFileSync(file(), '{"type":"assistant"}\n');
    await wait(250);

    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo).toHaveBeenCalledWith('conn', MessageType.SESSION_EXTERNALLY_CHANGED, { sessionId: 'child' });
  });

  it('says nothing while the transcript does not grow', async () => {
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);
    await wait(200);

    expect(sendTo).not.toHaveBeenCalled();
  });

  it('counts the session as running after a growth, and stops counting it a moment later', async () => {
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);

    appendFileSync(file(), '{"type":"assistant"}\n');
    await vi.waitFor(() => expect(setExternalRunning).toHaveBeenCalledWith('child', true), { timeout: 1500 });

    await vi.waitFor(() => expect(setExternalRunning).toHaveBeenLastCalledWith('child', false), { timeout: 1500 });
  });

  // The backend that runs the CLI knows its own turns (from the CLI's events, whatever screens it has open); the
  // transcript says nothing while a long tool call runs, and does not say that the turn is over (#711).
  describe('a session another window\'s backend holds', () => {
    it('counts the session as running for as long as the holder says a turn is in flight, though the transcript is quiet', async () => {
      holderSays = { activity: 'idle', turnStartedAt: 1700000000000 };
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);

      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenCalledWith('child', true), { timeout: 1500 });
      // well past the grace the transcript alone would give: it is still running
      await wait(400);
      expect(setExternalRunning).not.toHaveBeenCalledWith('child', false);
      expect(setHeldElsewhere).toHaveBeenCalledWith('child', true);
    });

    it('stops counting it as soon as the holder says no turn is in flight, not after the grace', async () => {
      holderSays = { activity: 'idle', turnStartedAt: 1700000000000 };
      await followSessionTranscript('conn', 'child', '/work', connections, { ...FAST, runningGraceMs: 60_000 });
      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenCalledWith('child', true), { timeout: 1500 });

      holderSays = { activity: 'idle', turnStartedAt: null };

      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenLastCalledWith('child', false), { timeout: 1500 });
    });

    // A message handed to a CLI that is finishing a turn starts the next turn at once, and that turn's first output
    // comes seconds later: the holder says no turn is in flight, and the transcript's last line is the message.
    it('does not stop counting it while the transcript ends in a message that nothing has answered yet', async () => {
      holderSays = { activity: 'idle', turnStartedAt: 1700000000000 };
      await followSessionTranscript('conn', 'child', '/work', connections, { ...FAST, runningGraceMs: 60_000 });
      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenCalledWith('child', true), { timeout: 1500 });

      appendFileSync(file(), JSON.stringify({ type: 'user', timestamp: new Date().toISOString(), message: { role: 'user', content: 'one more thing' } }) + '\n');
      holderSays = { activity: 'idle', turnStartedAt: null };
      await wait(300);
      expect(setExternalRunning).not.toHaveBeenCalledWith('child', false);

      // the answer is written: now the work is over
      appendFileSync(file(), JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } }) + '\n');
      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenLastCalledWith('child', false), { timeout: 1500 });
    });

    it('keeps the grace for a holder too old to say whether a turn is in flight', async () => {
      holderSays = { activity: 'idle' };
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      appendFileSync(file(), '{"type":"assistant"}\n');

      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenCalledWith('child', true), { timeout: 1500 });
      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenLastCalledWith('child', false), { timeout: 1500 });
      expect(setHeldElsewhere).toHaveBeenCalledWith('child', true);
    });

    // An older backend writes no address into the registry and a hung one does not answer: neither can be asked, and
    // both still hold the session. The person is shown the way to take it over all the same.
    it('says the session is held elsewhere when the registry names a backend that does not answer', async () => {
      holderSays = undefined;
      registryHolds = true;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      await wait(150);

      expect(setHeldElsewhere).toHaveBeenCalledWith('child', true);
      expect(setHeldElsewhere).not.toHaveBeenCalledWith('child', false);
    });

    it('says the session is not held elsewhere when no backend answers for it', async () => {
      holderSays = undefined;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      await wait(150);

      expect(setHeldElsewhere).toHaveBeenCalledWith('child', false);
      expect(setHeldElsewhere).not.toHaveBeenCalledWith('child', true);
    });
  });

  // A session another session started for another project's folder is not in the folder of the screen that shows it.
  it('follows a transcript that is in another project folder', async () => {
    rmSync(file());
    mkdirSync(join(configDir, 'projects', '-other-project'), { recursive: true });
    const elsewhere = join(configDir, 'projects', '-other-project', 'child.jsonl');
    writeFileSync(elsewhere, '{"type":"user"}\n');
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);

    appendFileSync(elsewhere, '{"type":"assistant"}\n');
    await vi.waitFor(() => expect(sendTo).toHaveBeenCalledWith('conn', MessageType.SESSION_EXTERNALLY_CHANGED, { sessionId: 'child' }), { timeout: 1500 });
  });

  it('leaves a session this backend runs to its own program', async () => {
    getProcess.mockReturnValue({ pid: 1 });
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);

    appendFileSync(file(), '{"type":"assistant"}\n');
    await wait(250);

    expect(sendTo).not.toHaveBeenCalled();
    expect(setExternalRunning).not.toHaveBeenCalled();
  });

  it('follows the session of one screen at a time', async () => {
    writeFileSync(join(sessionsDir, 'other.jsonl'), '{"type":"user"}\n');
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);
    await followSessionTranscript('conn', 'other', '/work', connections, FAST);

    appendFileSync(file(), '{"type":"assistant"}\n');
    await wait(200);
    expect(sendTo).not.toHaveBeenCalled();

    appendFileSync(join(sessionsDir, 'other.jsonl'), '{"type":"assistant"}\n');
    await wait(200);
    expect(sendTo).toHaveBeenCalledWith('conn', MessageType.SESSION_EXTERNALLY_CHANGED, { sessionId: 'other' });
  });

  it('stops when the screen is gone', async () => {
    await followSessionTranscript('conn', 'child', '/work', connections, FAST);
    stopFollowingSessionTranscript('conn', connections);

    appendFileSync(file(), '{"type":"assistant"}\n');
    await wait(250);

    expect(sendTo).not.toHaveBeenCalled();
  });

  it('starts with a transcript that is not written yet, and tells at the first lines', async () => {
    await followSessionTranscript('conn', 'later', '/work', connections, FAST);

    writeFileSync(join(sessionsDir, 'later.jsonl'), '{"type":"user"}\n');
    await wait(250);

    expect(sendTo).toHaveBeenCalledWith('conn', MessageType.SESSION_EXTERNALLY_CHANGED, { sessionId: 'later' });
  });

  describe('unread', () => {
    it('is unread when the session stops growing and its last response is newer than the last look', async () => {
      responseAt = 2000;
      readAt = 1000;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      setExternalDone.mockClear();

      appendFileSync(file(), '{"type":"assistant"}\n');

      await vi.waitFor(() => expect(setExternalDone).toHaveBeenLastCalledWith('child', true), { timeout: 2000 });
    });

    it('is read when the person looked after the last response', async () => {
      responseAt = 1000;
      readAt = 2000;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      appendFileSync(file(), '{"type":"assistant"}\n');

      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenLastCalledWith('child', false), { timeout: 2000 });
      expect(setExternalDone).toHaveBeenLastCalledWith('child', false);
    });

    it('is unread from the start for a session that answered while nobody looked', async () => {
      responseAt = 5000;
      readAt = 1000;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);

      await vi.waitFor(() => expect(setExternalDone).toHaveBeenCalledWith('child', true), { timeout: 1000 });
    });

    it('is not unread while it grows: a running session is not waiting to be read', async () => {
      responseAt = 5000;
      readAt = 1000;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      await vi.waitFor(() => expect(setExternalDone).toHaveBeenCalledWith('child', true), { timeout: 1000 });

      appendFileSync(file(), '{"type":"assistant"}\n');

      await vi.waitFor(() => expect(setExternalDone).toHaveBeenCalledWith('child', false), { timeout: 1000 });
    });

    it('leaves a session this backend runs to its own state', async () => {
      getProcess.mockReturnValue({ pid: 1 });
      responseAt = 5000;
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      await wait(150);

      expect(setExternalDone).not.toHaveBeenCalled();
    });
  });

  describe('watchSessions: the sessions a transcript points at', () => {
    it('keeps what they are doing, and does not tell the screen to read them again', async () => {
      responseAt = 5000;
      readAt = 1000;
      await watchSessions('conn', [{ sessionId: 'child', workingDir: '/work' }], connections, FAST);
      await vi.waitFor(() => expect(setExternalDone).toHaveBeenCalledWith('child', true), { timeout: 1000 });

      appendFileSync(file(), '{"type":"assistant"}\n');
      await vi.waitFor(() => expect(setExternalRunning).toHaveBeenCalledWith('child', true), { timeout: 1500 });
      await wait(150);

      expect(sendTo).not.toHaveBeenCalled();
    });

    it('lets go of a session the next call no longer names', async () => {
      writeFileSync(join(sessionsDir, 'other.jsonl'), '{"type":"user"}\n');
      await watchSessions('conn', [{ sessionId: 'child', workingDir: '/work' }, { sessionId: 'other', workingDir: '/work' }], connections, FAST);
      await watchSessions('conn', [{ sessionId: 'other', workingDir: '/work' }], connections, FAST);
      setExternalRunning.mockClear();

      appendFileSync(file(), '{"type":"assistant"}\n');
      await wait(250);

      expect(setExternalRunning).not.toHaveBeenCalledWith('child', true);
    });

    it('does not let go of the session the screen shows', async () => {
      await followSessionTranscript('conn', 'child', '/work', connections, FAST);
      await watchSessions('conn', [], connections, FAST);

      appendFileSync(file(), '{"type":"assistant"}\n');

      await vi.waitFor(() => expect(sendTo).toHaveBeenCalledWith('conn', MessageType.SESSION_EXTERNALLY_CHANGED, { sessionId: 'child' }), { timeout: 1500 });
    });
  });
});
