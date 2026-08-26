/**
 * The approval gate and the refresh that gets past it (#359).
 *
 * The bug these are about: a review is built from the file as it was when the
 * request arrived, and approving wrote that snapshot back — discarding anything
 * that landed on disk while the review waited. A 1090-line file came back as
 * the single line that had been proposed, taking uncommitted work with it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const sendControlResponseToProcess = vi.fn();
const sendMessageToProcess = vi.fn();
vi.mock('../../claude-process', () => ({
  sendControlResponseToProcess: (...args: unknown[]) => sendControlResponseToProcess(...args),
  sendMessageToProcess: (...args: unknown[]) => sendMessageToProcess(...args),
}));

import { resolveDiffReview } from '../resolveDiff';
import { refreshReviewAgainstDisk } from '../refreshReview';
import { notifyReviewsOfFileChange } from '../reviewBaseWatch';
import { rememberPreview, clearPreviews, peekPreview } from '../diffPreview';
import { computeHunks } from '../hunks';
import { MessageType } from '../../../shared';

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

let dir: string;

function connections() {
  return { broadcastToSession: vi.fn() };
}

/** The reported file-edit request, with its base as of when it arrived. */
function remember(
  toolUseId: string,
  filePath: string,
  base: string,
  proposal: string,
  toolName = 'Write',
) {
  rememberPreview(toolUseId, {
    filePath,
    oldContent: base,
    newContent: proposal,
    hunks: computeHunks(base, proposal) ?? [],
    input:
      toolName === 'Write'
        ? { file_path: filePath, content: proposal }
        : { file_path: filePath, old_string: 'line 5', new_string: 'line 5 CHANGED' },
    toolName,
    sessionId: 'sess-1',
    controlRequestId: 'ctrl-1',
  });
}

const wholeFile = (base: string, proposal: string) => [{
  oldStart: 0,
  oldEnd: base === '' ? 0 : base.replace(/\n$/, '').split('\n').length,
  newStart: 0,
  newEnd: proposal === '' ? 0 : proposal.replace(/\n$/, '').split('\n').length,
}];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-gate-'));
  sendControlResponseToProcess.mockClear();
  sendMessageToProcess.mockClear();
  clearPreviews();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('the approval gate', () => {
  it('holds the #359 case instead of writing the stale snapshot', async () => {
    const base = lines(1090);
    const path = join(dir, 'index_js.php');
    // The user saved WIP work after the review was built.
    await writeFile(path, base.replace('line 900\n', 'line 900 USER WIP\n'), 'utf8');
    remember('t-359', path, base, 'ONLY THIS LINE\n');

    const conn = connections();
    await resolveDiffReview(conn as never, {
      toolUseId: 't-359',
      controlRequestId: 'ctrl-1',
      sessionId: 'sess-1',
      acceptedRanges: wholeFile(base, 'ONLY THIS LINE\n'),
    });

    // Nothing was answered, so the CLI writes nothing.
    expect(sendControlResponseToProcess).not.toHaveBeenCalled();

    // The surface is told, and told that this was the gate.
    const [, type, payload] = conn.broadcastToSession.mock.calls[0];
    expect(type).toBe(MessageType.REVIEW_BASE_CHANGED);
    expect(payload).toMatchObject({ toolUseId: 't-359', blockedApproval: true });

    // The user's work is still on disk.
    const { readFile } = await import('fs/promises');
    expect(await readFile(path, 'utf8')).toContain('USER WIP');
  });

  it('keeps the request answerable, so the held review is not lost', async () => {
    const base = lines(20);
    const path = join(dir, 'a.txt');
    await writeFile(path, base.replace('line 7\n', 'line 7 EDITED\n'), 'utf8');
    remember('t-hold', path, base, 'ONE\n');

    await resolveDiffReview(connections() as never, {
      toolUseId: 't-hold', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: wholeFile(base, 'ONE\n'),
    });

    // The entry survives: a consumed preview could never be answered again, and
    // the approval buttons would be live with nothing behind them.
    expect(peekPreview('t-hold')).toBeDefined();
  });

  it('answers normally when the file has not moved', async () => {
    const base = lines(20);
    const path = join(dir, 'b.txt');
    await writeFile(path, base, 'utf8');
    remember('t-ok', path, base, 'ONE\n');

    await resolveDiffReview(connections() as never, {
      toolUseId: 't-ok', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: wholeFile(base, 'ONE\n'),
    });

    expect(sendControlResponseToProcess).toHaveBeenCalled();
    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(peekPreview('t-ok')).toBeUndefined();
  });

  it('lets a denial through without checking disk', async () => {
    // Denying writes nothing, so a moved file is irrelevant — and refusing to
    // deny would strand the request with no way to say no.
    const base = lines(20);
    const path = join(dir, 'c.txt');
    await writeFile(path, 'completely different\n', 'utf8');
    remember('t-deny', path, base, 'ONE\n');

    await resolveDiffReview(connections() as never, {
      toolUseId: 't-deny', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
  });

  it('holds when the file has been deleted under the review', async () => {
    remember('t-gone', join(dir, 'gone.txt'), lines(5), 'ONE\n');

    const conn = connections();
    await resolveDiffReview(conn as never, {
      toolUseId: 't-gone', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: wholeFile(lines(5), 'ONE\n'),
    });

    expect(sendControlResponseToProcess).not.toHaveBeenCalled();
    const [, , payload] = conn.broadcastToSession.mock.calls[0];
    expect(payload).toMatchObject({ reason: 'unreadable' });
  });

  it('lets a Write creating a new file through', async () => {
    // Base '' and still absent is not a change; blocking it would break every
    // new-file write.
    remember('t-new', join(dir, 'new.txt'), '', 'fresh\n');

    await resolveDiffReview(connections() as never, {
      toolUseId: 't-new', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: wholeFile('', 'fresh\n'),
    });

    expect(sendControlResponseToProcess).toHaveBeenCalled();
  });
});

describe('the chat prompt path (TOOL_RESPONSE)', () => {
  /*
   * The button the #359 reporter actually pressed.
   *
   * The gate first landed only on RESOLVE_DIFF — the review diff's own Confirm —
   * so the reported case went straight through: measured live, the approval left
   * as TOOL_RESPONSE and no HELD line was logged. The file survived only because
   * the CLI noticed the change itself, which Write does not always do.
   */
  it('holds a chat approval whose file moved', async () => {
    const { toolResponseHandler } = await import('../../handlers/toolResponse');
    const base = lines(1090);
    const path = join(dir, 'chat.php');
    await writeFile(path, base.replace('line 900\n', 'line 900 USER WIP\n'), 'utf8');
    remember('t-chat', path, base, 'ONLY THIS LINE\n');

    const conn = {
      ...connections(),
      getClient: () => ({ subscribedSessionId: 'sess-1' }),
      sendTo: vi.fn(),
    };
    const bridge = { closeDiff: vi.fn(async () => undefined), closeDiffTab: vi.fn(async () => undefined) };

    await toolResponseHandler(
      'conn-1',
      { type: 'TOOL_RESPONSE', requestId: 'r1', payload: {
        toolUseId: 't-chat', approved: true, controlRequestId: 'ctrl-1',
      } } as never,
      conn as never,
      bridge as never,
    );

    // Nothing answered, so the CLI writes nothing.
    expect(sendControlResponseToProcess).not.toHaveBeenCalled();
    // The surface is told it was the gate.
    const [, type, payload] = conn.broadcastToSession.mock.calls[0];
    expect(type).toBe(MessageType.REVIEW_BASE_CHANGED);
    expect(payload).toMatchObject({ toolUseId: 't-chat', blockedApproval: true });
    // Still answerable after the hold.
    expect(peekPreview('t-chat')).toBeDefined();
  });

  it('answers a chat approval normally when the file has not moved', async () => {
    const { toolResponseHandler } = await import('../../handlers/toolResponse');
    const base = lines(20);
    const path = join(dir, 'chat-ok.php');
    await writeFile(path, base, 'utf8');
    remember('t-chat-ok', path, base, 'ONE\n');

    const conn = {
      ...connections(),
      getClient: () => ({ subscribedSessionId: 'sess-1' }),
      sendTo: vi.fn(),
    };
    const bridge = { closeDiff: vi.fn(async () => undefined), closeDiffTab: vi.fn(async () => undefined) };

    await toolResponseHandler(
      'conn-1',
      { type: 'TOOL_RESPONSE', requestId: 'r1', payload: {
        toolUseId: 't-chat-ok', approved: true, controlRequestId: 'ctrl-1',
      } } as never,
      conn as never,
      bridge as never,
    );

    expect(sendControlResponseToProcess).toHaveBeenCalled();
    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
  });

  it('lets a chat denial through even when the file moved', async () => {
    // Denying writes nothing, and blocking it would strand the request with no
    // way to say no.
    const { toolResponseHandler } = await import('../../handlers/toolResponse');
    const base = lines(20);
    const path = join(dir, 'chat-deny.php');
    await writeFile(path, 'completely different\n', 'utf8');
    remember('t-chat-deny', path, base, 'ONE\n');

    const conn = {
      ...connections(),
      getClient: () => ({ subscribedSessionId: 'sess-1' }),
      sendTo: vi.fn(),
    };
    const bridge = { closeDiff: vi.fn(async () => undefined), closeDiffTab: vi.fn(async () => undefined) };

    await toolResponseHandler(
      'conn-1',
      { type: 'TOOL_RESPONSE', requestId: 'r1', payload: {
        toolUseId: 't-chat-deny', approved: false, controlRequestId: 'ctrl-1',
      } } as never,
      conn as never,
      bridge as never,
    );

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
  });
});

describe('refreshing a held review', () => {
  it('restates a Write against the current file', async () => {
    const base = lines(20);
    const path = join(dir, 'w.txt');
    const withWip = base.replace('line 15\n', 'line 15 USER WIP\n');
    await writeFile(path, withWip, 'utf8');
    remember('t-refresh', path, base, 'REPLACED\n');

    const outcome = await refreshReviewAgainstDisk('t-refresh');

    expect(outcome.status).toBe('refreshed');
    if (outcome.status !== 'refreshed') throw new Error('unreachable');
    // The base is now what is really on disk, WIP and all.
    expect(outcome.preview.oldContent).toContain('USER WIP');
  });

  it('makes the held approval succeed afterwards', async () => {
    const base = lines(20);
    const path = join(dir, 'seq.txt');
    await writeFile(path, base.replace('line 9\n', 'line 9 WIP\n'), 'utf8');
    remember('t-seq', path, base, 'REPLACED\n');

    // First approval is held.
    await resolveDiffReview(connections() as never, {
      toolUseId: 't-seq', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: wholeFile(base, 'REPLACED\n'),
    });
    expect(sendControlResponseToProcess).not.toHaveBeenCalled();

    // The user refreshes, then approves again.
    const refreshed = await refreshReviewAgainstDisk('t-seq');
    expect(refreshed.status).toBe('refreshed');
    if (refreshed.status !== 'refreshed') throw new Error('unreachable');

    await resolveDiffReview(connections() as never, {
      toolUseId: 't-seq', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: wholeFile(refreshed.preview.oldContent, refreshed.preview.newContent),
    });

    expect(sendControlResponseToProcess).toHaveBeenCalled();
    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
  });

  it('reports an Edit that no longer applies rather than guessing', async () => {
    const base = lines(20);
    const path = join(dir, 'e.txt');
    // The line the Edit targets is gone.
    await writeFile(path, base.replace('line 5\n', 'something else entirely\n'), 'utf8');
    remember('t-edit', path, base, base.replace('line 5\n', 'line 5 CHANGED\n'), 'Edit');

    const outcome = await refreshReviewAgainstDisk('t-edit');
    expect(outcome).toEqual({ status: 'unrebuildable', reason: 'no-longer-applies' });
  });

  it('reports unchanged when nothing moved', async () => {
    const base = lines(10);
    const path = join(dir, 'u.txt');
    await writeFile(path, base, 'utf8');
    remember('t-same', path, base, 'ONE\n');

    expect((await refreshReviewAgainstDisk('t-same')).status).toBe('unchanged');
  });

  it('reports unknown for a review that was already answered', async () => {
    expect(await refreshReviewAgainstDisk('never-existed')).toEqual({ status: 'unknown' });
  });
});

describe('the save notification', () => {
  it('tells the review surface when a save moves its base', async () => {
    const base = lines(10);
    const path = join(dir, 's.txt');
    await writeFile(path, base.replace('line 2\n', 'line 2 SAVED\n'), 'utf8');
    remember('t-save', path, base, 'ONE\n');

    const conn = connections();
    await notifyReviewsOfFileChange(conn as never, path);

    const [, type, payload] = conn.broadcastToSession.mock.calls[0];
    expect(type).toBe(MessageType.REVIEW_BASE_CHANGED);
    expect(payload).toMatchObject({ toolUseId: 't-save' });
  });

  it('stays quiet when the save did not change the content', async () => {
    const base = lines(10);
    const path = join(dir, 'q.txt');
    await writeFile(path, base, 'utf8');
    remember('t-quiet', path, base, 'ONE\n');

    const conn = connections();
    await notifyReviewsOfFileChange(conn as never, path);

    expect(conn.broadcastToSession).not.toHaveBeenCalled();
  });

  it('ignores a save of a file no review is about', async () => {
    const base = lines(10);
    await writeFile(join(dir, 'other.txt'), 'anything\n', 'utf8');
    remember('t-unrelated', join(dir, 'watched.txt'), base, 'ONE\n');

    const conn = connections();
    await notifyReviewsOfFileChange(conn as never, join(dir, 'other.txt'));

    expect(conn.broadcastToSession).not.toHaveBeenCalled();
  });

  it('matches a path the IDE spells with backslashes', async () => {
    // Windows reports saves with native separators while the CLI's tool input
    // may carry forward slashes; a miss here is the data loss coming back.
    const base = lines(10);
    const path = join(dir, 'win.txt');
    await writeFile(path, base.replace('line 3\n', 'line 3 SAVED\n'), 'utf8');
    remember('t-win', path, base, 'ONE\n');

    const conn = connections();
    await notifyReviewsOfFileChange(conn as never, path.replace(/\//g, '\\'));

    expect(conn.broadcastToSession).toHaveBeenCalled();
  });
});
