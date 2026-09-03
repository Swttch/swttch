/**
 * A review diff answers the CLI's permission request, so this is where a
 * mis-parse or a wrong default writes the wrong thing to disk. Shared by the
 * IDE's diff and the webview's own, which is why the ranges below are written
 * as "the review surface reported them" rather than as anything IDE-specific.
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

import { parseResolveDiffParams, resolveDiffReview } from '../resolveDiff';
import { takeMessagesForFinishedTurn, clearAllPendingMessages } from '../afterTurn';
import { rememberPreview, clearPreviews, takePreview } from '../diffPreview';

/**
 * What Claude was told, read from where it now waits.
 *
 * The notice is HELD until the turn ends rather than written to stdin straight
 * away — the CLI discards user messages queued mid-turn (see afterTurn), and
 * answering a permission request is always mid-turn. So the assertion is on
 * what is waiting for that session, not on a stdin call.
 */
function noticesFor(sessionId: string): string[] {
  return takeMessagesForFinishedTurn(sessionId);
}
import { computeHunks, type AcceptedRange } from '../hunks';
import { USER_DECLINED_PREFIX } from '../../../shared';

const original = ['debug: false', ...Array.from({ length: 8 }, (_, i) => `pad-${i}`), 'timeout: 30'].join('\n') + '\n';
const proposed = original.replace('debug: false', 'debug: true').replace('timeout: 30', 'timeout: 60');

function connections() {
  return { broadcastToSession: vi.fn() } as never;
}

// The changed lines as the IDE reports them (0-based, end-exclusive).
const R_DEBUG: AcceptedRange = { oldStart: 0, oldEnd: 1, newStart: 0, newEnd: 1 };
const R_TIMEOUT: AcceptedRange = { oldStart: 9, oldEnd: 10, newStart: 9, newEnd: 10 };

/*
 * A real file on disk, holding exactly what the preview claims as its base.
 *
 * The approval gate re-reads the file before answering (#359), so a review
 * whose path does not exist is held rather than answered. Pointing these
 * fixtures at a path that was never created would make every test here exercise
 * the gate instead of the behaviour it is about.
 */
let dir: string;
let configPath: string;

function pending(toolUseId: string) {
  const hunks = computeHunks(original, proposed)!;
  rememberPreview(toolUseId, {
    filePath: configPath,
    oldContent: original,
    newContent: proposed,
    hunks,
    input: { file_path: configPath, old_string: 'x', new_string: 'y' },
    toolName: 'Edit',
  });
  return hunks;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'resolve-diff-'));
  configPath = join(dir, 'config.txt');
  await writeFile(configPath, original, 'utf8');

  sendControlResponseToProcess.mockClear();
  sendMessageToProcess.mockClear();
  clearAllPendingMessages();
  clearPreviews();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('parseResolveDiffParams', () => {
  const good = {
    toolUseId: 't1',
    controlRequestId: 'ctrl-1',
    sessionId: 'sess-1',
    acceptedRanges: [R_DEBUG, R_TIMEOUT],
  };

  it('accepts a well-formed notification', async () => {
    // The session grant is absent here, so it comes back off. Stated rather
    // than left to `toEqual` ignoring it: a parser that defaulted this to true
    // would hand out standing permission nobody asked for (#393).
    expect(parseResolveDiffParams(good)).toEqual({
      ...good,
      allowAllEditsThisSession: false,
    });
  });

  it('only grants the session rule when the flag is literally true (#393)', async () => {
    // Anything other than the flag being sent on purpose reads as "not asked
    // for" — a truthy string off the wire must not grant standing permission.
    for (const value of [undefined, false, 'true', 1, {}, null]) {
      const parsed = parseResolveDiffParams({ ...good, allowAllEditsThisSession: value });
      expect(parsed?.allowAllEditsThisSession).toBe(false);
    }
    const granted = parseResolveDiffParams({ ...good, allowAllEditsThisSession: true });
    expect(granted?.allowAllEditsThisSession).toBe(true);
  });

  it('rejects one missing any id it must quote back', async () => {
    for (const key of ['toolUseId', 'controlRequestId', 'sessionId']) {
      const bad = { ...good, [key]: undefined };
      expect(parseResolveDiffParams(bad), key).toBeNull();
    }
  });

  it('treats a missing selection as keeping nothing', async () => {
    // Not as "keep everything": defaulting the other way would write a change
    // the user never confirmed.
    expect(parseResolveDiffParams({ ...good, acceptedRanges: undefined })?.acceptedRanges).toEqual([]);
  });

  it('drops malformed ranges rather than trusting the wire', async () => {
    const parsed = parseResolveDiffParams({
      ...good,
      acceptedRanges: [R_DEBUG, { oldStart: 'x' }, null, { oldStart: 1 }, R_TIMEOUT],
    });
    expect(parsed?.acceptedRanges).toEqual([R_DEBUG, R_TIMEOUT]);
  });

  it('carries the edited proposal through (#305)', async () => {
    const parsed = parseResolveDiffParams({ ...good, editedContent: 'typed\n' });
    expect(parsed?.editedContent).toBe('typed\n');
  });

  it('treats an empty edit as text, not as absent', async () => {
    // Emptying the proposed side is a real answer — "write nothing" — and must
    // not fall back to rebuilding the proposal from ranges.
    expect(parseResolveDiffParams({ ...good, editedContent: '' })?.editedContent).toBe('');
  });

  it('ignores a non-string edit rather than trusting the wire', async () => {
    expect(parseResolveDiffParams({ ...good, editedContent: 42 })?.editedContent).toBeUndefined();
  });
});

describe('resolveDiffReview', () => {
  it('keeping every hunk sends the request through unchanged', async () => {
    pending('t-all');
    await resolveDiffReview(connections(), {
      toolUseId: 't-all', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    // Claude's own proposal already says this; amending would rewrite an Edit
    // into a synthesised one for no reason.
    expect(response.response.updatedInput).toEqual({});
  });

  it('keeping some rewrites the tool input to that subset', async () => {
    pending('t-partial');
    await resolveDiffReview(connections(), {
      toolUseId: 't-partial', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    const input = response.response.updatedInput;
    // Stays in Edit shape — a Write-shaped input is rejected by the CLI with
    // "File has not been read yet" (measured).
    expect(original).toContain(input.old_string);
    expect(input.new_string).toContain('debug: true');
    expect(input.new_string).not.toContain('timeout: 60');
  });

  it('keeping nothing is a denial, not a write of unchanged content', async () => {
    pending('t-none');
    await resolveDiffReview(connections(), {
      toolUseId: 't-none', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toContain(USER_DECLINED_PREFIX);
  });

  it('answers a request we never previewed as a plain approval', async () => {
    // No stored change means no basis to narrow it; inventing a decision the
    // user did not make would be worse than approving what they were shown.
    await resolveDiffReview(connections(), {
      toolUseId: 't-unknown', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput).toEqual({});
  });

  it('consumes the preview so a second answer cannot re-apply it', async () => {
    pending('t-once');
    const params = {
      toolUseId: 't-once', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG],
    };
    await resolveDiffReview(connections(), params);
    expect(takePreview('t-once')).toBeUndefined();
  });

  it('writes what the reviewer typed, not what was proposed (#305)', async () => {
    pending('t-edited');
    const typed = original.replace('debug: false', 'debug: MAYBE');
    await resolveDiffReview(connections(), {
      toolUseId: 't-edited', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      // Ranges still say "keep everything"; the typed text overrides them.
      acceptedRanges: [R_DEBUG, R_TIMEOUT],
      editedContent: typed,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    const input = response.response.updatedInput;
    expect(response.response.behavior).toBe('allow');
    expect(original.replace(input.old_string, input.new_string)).toBe(typed);
    expect(input.new_string).toContain('debug: MAYBE');
    expect(input.new_string).not.toContain('debug: true');
  });

  it('applies an edit even when no hunk was ticked', async () => {
    // Unticking everything then typing is an answer, not a denial: the text on
    // screen differs from the file, so there is something to write.
    pending('t-edited-none');
    const typed = original.replace('debug: false', 'debug: MAYBE');
    await resolveDiffReview(connections(), {
      toolUseId: 't-edited-none', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [], editedContent: typed,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput.new_string).toContain('debug: MAYBE');
  });

  it('denies when the reviewer edited the proposal back to the original', async () => {
    // Leaving the proposed side identical to the file means nothing to write.
    // Approving it would report success for an edit that never happened.
    pending('t-edited-back');
    await resolveDiffReview(connections(), {
      toolUseId: 't-edited-back', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: original,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toContain(USER_DECLINED_PREFIX);
  });

  it('lets an untouched edit through unchanged', async () => {
    // Typing and undoing leaves the proposal exactly as Claude wrote it, so the
    // original call should still go through rather than be synthesised.
    pending('t-edited-noop');
    await resolveDiffReview(connections(), {
      toolUseId: 't-edited-noop', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: proposed,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput).toEqual({});
  });

  it('tells Claude the proposal was edited, quoting what was applied (#305)', async () => {
    // The permission protocol cannot carry this: the transcript keeps the
    // model's own tool_use, so without the reminder it goes on believing it
    // wrote the value it proposed.
    pending('t-notice');
    const typed = original.replace('debug: false', 'debug: MAYBE');
    await resolveDiffReview(connections(), {
      toolUseId: 't-notice', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: typed,
    });

    const held = noticesFor('sess-1');
    expect(held).toHaveLength(1);
    const sessionId = 'sess-1';
    const text = held[0];
    expect(sessionId).toBe('sess-1');
    // Hidden from the chat: our webview strips this tag before rendering.
    expect(text).toContain('<system-reminder>');
    expect(text).toContain('The user edited your proposed change');
    // Quotes the applied text rather than summarising it.
    expect(text).toContain('debug: MAYBE');
    // And sends the assistant back to what it said before the edit, rather than
    // letting it acknowledge the notice and move on.
    expect(text).toContain('review the actual edits');
  });

  it('answers the request now and holds the reminder for later', async () => {
    // The control_response cannot wait — the CLI is blocked on it. The notice
    // must, because a user message written while that turn finishes is enqueued
    // by the CLI and then dropped as it clears the queue (measured).
    pending('t-order');
    const typed = original.replace('debug: false', 'debug: MAYBE');

    await resolveDiffReview(connections(), {
      toolUseId: 't-order', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG], editedContent: typed,
    });

    // Answered immediately...
    expect(sendControlResponseToProcess).toHaveBeenCalled();
    // ...and nothing written to stdin as a user message in the same breath.
    expect(sendMessageToProcess).not.toHaveBeenCalled();
    // The notice is waiting for the turn to end.
    expect(noticesFor('sess-1')).toHaveLength(1);
  });

  it('reports only what the reviewer changed about the proposal', async () => {
    // Measured against the proposal, not the file: the model already knows
    // what it asked for, and a Write's amended input is the whole file — once
    // 3.7KB to say a single number had changed.
    pending('t-narrow');
    const typed = proposed.replace('debug: true', 'debug: MAYBE');
    await resolveDiffReview(connections(), {
      toolUseId: 't-narrow', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: typed,
    });

    const text = noticesFor('sess-1')[0];
    expect(text).toContain('debug: MAYBE');
    // The untouched lines of the proposal stay out of it.
    expect(text).not.toContain('pad-4');
    expect(text).not.toContain('timeout: 60');
  });

  it('reports a partial accept, where less landed than was proposed', async () => {
    // Silence here left Claude believing the whole change was written, and the
    // next turn was built on a file that does not exist. Telling it is the rule;
    // saying nothing is the exception, and the exception is a FULL accept.
    pending('t-quiet');
    await resolveDiffReview(connections(), {
      toolUseId: 't-quiet', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG],
    });

    expect(noticesFor('sess-1')).toHaveLength(1);
  });

  it('says nothing when an edit reproduced the proposal', async () => {
    // Typing and undoing leaves nothing to correct.
    pending('t-quiet-noop');
    await resolveDiffReview(connections(), {
      toolUseId: 't-quiet-noop', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: proposed,
    });

    expect(noticesFor('sess-1')).toHaveLength(0);
  });

  it('says nothing when the reviewer rejected the change', async () => {
    pending('t-quiet-deny');
    await resolveDiffReview(connections(), {
      toolUseId: 't-quiet-deny', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [], editedContent: original,
    });

    expect(noticesFor('sess-1')).toHaveLength(0);
  });

  it('quotes the request id the CLI is waiting on', async () => {
    pending('t-id');
    await resolveDiffReview(connections(), {
      toolUseId: 't-id', controlRequestId: 'ctrl-42', sessionId: 'sess-9',
      acceptedRanges: [R_DEBUG],
    });

    const [, sessionId, response] = sendControlResponseToProcess.mock.calls[0];
    expect(sessionId).toBe('sess-9');
    expect(response.request_id).toBe('ctrl-42');
  });
});

describe('several files under review at once', () => {
  // Claude often edits a few files in one turn, so their requests overlap.
  // Each must resolve against its own change: a selection meant for one file
  // applied to another would write a subset nobody chose.
  const fileAOld = ['a: 1', ...Array.from({ length: 8 }, (_, i) => `mid-${i}`), 'z: 9'].join('\n') + '\n';
  const fileA = { old: fileAOld, new: fileAOld.replace('a: 1', 'a: 2').replace('z: 9', 'z: 8') };
  const fileB = ['b: false', ...Array.from({ length: 8 }, (_, i) => `pad-${i}`), 'c: 30'].join('\n') + '\n';
  const fileBNew = fileB.replace('b: false', 'b: true').replace('c: 30', 'c: 60');

  /**
   * Store a pending review AND put its base on disk, because the approval gate
   * re-reads the file before answering (#359). A review pointing at a path that
   * was never written is held by that gate, which is correct behaviour but not
   * what these tests are about.
   *
   * Returns the real path, so callers assert against the file they created
   * rather than a literal that only looks like one.
   */
  async function remember(id: string, name: string, oldC: string, newC: string): Promise<string> {
    const path = join(dir, name);
    await writeFile(path, oldC, 'utf8');
    rememberPreview(id, {
      filePath: path,
      oldContent: oldC,
      newContent: newC,
      hunks: computeHunks(oldC, newC)!,
      input: { file_path: path },
      toolName: 'Edit',
    });
    return path;
  }

  it('resolves each request against its own file', async () => {
    const pathA = await remember('t-a', 'a.ts', fileA.old, fileA.new);
    const pathB = await remember('t-b', 'b.ts', fileB, fileBNew);

    // Answer B first, keeping only its first hunk.
    await resolveDiffReview(connections(), {
      toolUseId: 't-b', controlRequestId: 'ctrl-b', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });
    const bInput = sendControlResponseToProcess.mock.calls[0][2].response.updatedInput;
    expect(bInput.file_path).toBe(pathB);
    expect(bInput.new_string).toContain('b: true');
    expect(bInput.new_string).not.toContain('c: 60');

    // A is untouched by that, and still resolvable on its own terms.
    await resolveDiffReview(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });
    const aInput = sendControlResponseToProcess.mock.calls[1][2].response.updatedInput;
    expect(aInput.file_path).toBe(pathA);
  });

  it('answering one file does not consume another file\'s preview', async () => {
    const pathA = await remember('t-a', 'a.ts', fileA.old, fileA.new);
    const pathB = await remember('t-b', 'b.ts', fileB, fileBNew);

    await resolveDiffReview(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });

    expect(takePreview('t-a')).toBeUndefined();
    expect(takePreview('t-b')).toBeDefined();
  });

  it('denying one file leaves the others pending', async () => {
    const pathA = await remember('t-a', 'a.ts', fileA.old, fileA.new);
    const pathB = await remember('t-b', 'b.ts', fileB, fileBNew);

    await resolveDiffReview(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [],
    });

    expect(sendControlResponseToProcess.mock.calls[0][2].response.behavior).toBe('deny');
    expect(takePreview('t-b')).toBeDefined();
  });

  it('tells the chat which request was settled, not just that one was', async () => {
    // Two prompts can be queued; clearing the wrong one would leave the user
    // answering a question that is already gone.
    const pathA = await remember('t-a', 'a.ts', fileA.old, fileA.new);
    const conn = connections();

    await resolveDiffReview(conn, {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });

    const [, , payload] = (conn as any).broadcastToSession.mock.calls[0];
    expect(payload).toMatchObject({ toolUseId: 't-a', controlRequestId: 'ctrl-a' });
  });
});
