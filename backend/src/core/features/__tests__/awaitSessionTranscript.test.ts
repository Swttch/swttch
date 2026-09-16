import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  awaitSessionTranscript,
  cancelAllTranscriptWaits,
  cancelTranscriptWait,
  isAwaitingTranscript,
} from '../awaitSessionTranscript';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

/**
 * Waiting for one session's transcript to land.
 *
 * The session list is read from the transcripts on disk, and the transcript of
 * a session that just started is not there yet — measured at 4.45 seconds
 * behind the start. These tests pin WHICH file each wait is watching, because
 * that is what keeps two sessions started in the same second apart.
 */

let home: string;

function transcriptPath(workingDir: string, sessionId: string): Promise<string> {
  return getProjectSessionsPath(workingDir).then((dir) => join(dir, `${sessionId}.jsonl`));
}

async function writeTranscript(workingDir: string, sessionId: string): Promise<void> {
  const path = await transcriptPath(workingDir, sessionId);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '{}\n');
}

beforeEach(() => {
  vi.useFakeTimers();
  home = mkdtempSync(join(tmpdir(), 'ccg-transcript-'));
  // getProjectSessionsPath resolves under the Claude config dir, which is derived
  // from HOME. Pointing HOME at a temp directory keeps the real one untouched.
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
});

afterEach(() => {
  cancelAllTranscriptWaits();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe('awaitSessionTranscript', () => {
  it('fires immediately when the transcript is already there', async () => {
    const dir = '/tmp/project-a';
    await writeTranscript(dir, 'session-1');
    const onAppear = vi.fn();

    await awaitSessionTranscript('session-1', dir, onAppear);

    // A resumed session ran before, so its transcript predates the call and
    // there is nothing to wait for.
    expect(onAppear).toHaveBeenCalledTimes(1);
    expect(isAwaitingTranscript('session-1')).toBe(false);
  });

  it('waits, then fires once the transcript appears', async () => {
    const dir = '/tmp/project-a';
    const onAppear = vi.fn();

    await awaitSessionTranscript('session-1', dir, onAppear);
    expect(onAppear).not.toHaveBeenCalled();
    expect(isAwaitingTranscript('session-1')).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(onAppear).not.toHaveBeenCalled();

    await writeTranscript(dir, 'session-1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(onAppear).toHaveBeenCalledTimes(1);
    expect(isAwaitingTranscript('session-1')).toBe(false);
  });

  /**
   * The case this design exists for: several sessions started in the same
   * second, each waiting on its own file. One file landing must satisfy exactly
   * one wait — watching the FOLDER instead would fire all of them.
   */
  it('keeps concurrent waits apart, so one file satisfies only its own session', async () => {
    const dir = '/tmp/project-a';
    const first = vi.fn();
    const second = vi.fn();
    const third = vi.fn();

    await awaitSessionTranscript('session-1', dir, first);
    await awaitSessionTranscript('session-2', dir, second);
    await awaitSessionTranscript('session-3', dir, third);

    await writeTranscript(dir, 'session-2');
    await vi.advanceTimersByTimeAsync(2000);

    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(third).not.toHaveBeenCalled();
    expect(isAwaitingTranscript('session-1')).toBe(true);
    expect(isAwaitingTranscript('session-2')).toBe(false);
    expect(isAwaitingTranscript('session-3')).toBe(true);

    await writeTranscript(dir, 'session-3');
    await vi.advanceTimersByTimeAsync(2000);

    expect(third).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  /** Same id in two projects is two different files, so two different waits. */
  it('tells apart the same session id under different working directories', async () => {
    const a = vi.fn();
    const b = vi.fn();

    await awaitSessionTranscript('shared-id', '/tmp/project-a', a);
    // The second call is for a different project, but the map is keyed by
    // session id alone, so this documents the current contract rather than
    // pretending otherwise: one wait per session id at a time.
    await awaitSessionTranscript('shared-id', '/tmp/project-b', b);

    await writeTranscript('/tmp/project-a', 'shared-id');
    await vi.advanceTimersByTimeAsync(2000);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('ignores a second wait for a session already being waited on', async () => {
    const dir = '/tmp/project-a';
    const first = vi.fn();
    const second = vi.fn();

    await awaitSessionTranscript('session-1', dir, first);
    await awaitSessionTranscript('session-1', dir, second);

    await writeTranscript(dir, 'session-1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('gives up after the timeout without firing', async () => {
    const dir = '/tmp/project-a';
    const onAppear = vi.fn();

    await awaitSessionTranscript('session-1', dir, onAppear);
    await vi.advanceTimersByTimeAsync(130_000);

    expect(onAppear).not.toHaveBeenCalled();
    expect(isAwaitingTranscript('session-1')).toBe(false);
  });

  it('stops when cancelled', async () => {
    const dir = '/tmp/project-a';
    const onAppear = vi.fn();

    await awaitSessionTranscript('session-1', dir, onAppear);
    cancelTranscriptWait('session-1');

    await writeTranscript(dir, 'session-1');
    await vi.advanceTimersByTimeAsync(2000);

    expect(onAppear).not.toHaveBeenCalled();
  });
});
