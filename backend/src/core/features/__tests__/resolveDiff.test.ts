/**
 * A review diff answers the CLI's permission request, so this is where a
 * mis-parse or a wrong default writes the wrong thing to disk. Shared by the
 * IDE's diff and the webview's own, which is why the ranges below are written
 * as "the review surface reported them" rather than as anything IDE-specific.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendControlResponseToProcess = vi.fn();
vi.mock('../../claude-process', () => ({
  sendControlResponseToProcess: (...args: unknown[]) => sendControlResponseToProcess(...args),
}));

import { parseResolveDiffParams, resolveDiffReview } from '../resolveDiff';
import { rememberPreview, clearPreviews, takePreview } from '../diffPreview';
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

function pending(toolUseId: string) {
  const hunks = computeHunks(original, proposed)!;
  rememberPreview(toolUseId, {
    filePath: '/tmp/config.txt',
    oldContent: original,
    newContent: proposed,
    hunks,
    input: { file_path: '/tmp/config.txt', old_string: 'x', new_string: 'y' },
    toolName: 'Edit',
  });
  return hunks;
}

beforeEach(() => {
  sendControlResponseToProcess.mockClear();
  clearPreviews();
});

describe('parseResolveDiffParams', () => {
  const good = {
    toolUseId: 't1',
    controlRequestId: 'ctrl-1',
    sessionId: 'sess-1',
    acceptedRanges: [R_DEBUG, R_TIMEOUT],
  };

  it('accepts a well-formed notification', () => {
    expect(parseResolveDiffParams(good)).toEqual(good);
  });

  it('rejects one missing any id it must quote back', () => {
    for (const key of ['toolUseId', 'controlRequestId', 'sessionId']) {
      const bad = { ...good, [key]: undefined };
      expect(parseResolveDiffParams(bad), key).toBeNull();
    }
  });

  it('treats a missing selection as keeping nothing', () => {
    // Not as "keep everything": defaulting the other way would write a change
    // the user never confirmed.
    expect(parseResolveDiffParams({ ...good, acceptedRanges: undefined })?.acceptedRanges).toEqual([]);
  });

  it('drops malformed ranges rather than trusting the wire', () => {
    const parsed = parseResolveDiffParams({
      ...good,
      acceptedRanges: [R_DEBUG, { oldStart: 'x' }, null, { oldStart: 1 }, R_TIMEOUT],
    });
    expect(parsed?.acceptedRanges).toEqual([R_DEBUG, R_TIMEOUT]);
  });

  it('carries the edited proposal through (#305)', () => {
    const parsed = parseResolveDiffParams({ ...good, editedContent: 'typed\n' });
    expect(parsed?.editedContent).toBe('typed\n');
  });

  it('treats an empty edit as text, not as absent', () => {
    // Emptying the proposed side is a real answer — "write nothing" — and must
    // not fall back to rebuilding the proposal from ranges.
    expect(parseResolveDiffParams({ ...good, editedContent: '' })?.editedContent).toBe('');
  });

  it('ignores a non-string edit rather than trusting the wire', () => {
    expect(parseResolveDiffParams({ ...good, editedContent: 42 })?.editedContent).toBeUndefined();
  });
});

describe('resolveDiffReview', () => {
  it('keeping every hunk sends the request through unchanged', () => {
    pending('t-all');
    resolveDiffReview(connections(), {
      toolUseId: 't-all', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    // Claude's own proposal already says this; amending would rewrite an Edit
    // into a synthesised one for no reason.
    expect(response.response.updatedInput).toEqual({});
  });

  it('keeping some rewrites the tool input to that subset', () => {
    pending('t-partial');
    resolveDiffReview(connections(), {
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

  it('keeping nothing is a denial, not a write of unchanged content', () => {
    pending('t-none');
    resolveDiffReview(connections(), {
      toolUseId: 't-none', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toContain(USER_DECLINED_PREFIX);
  });

  it('answers a request we never previewed as a plain approval', () => {
    // No stored change means no basis to narrow it; inventing a decision the
    // user did not make would be worse than approving what they were shown.
    resolveDiffReview(connections(), {
      toolUseId: 't-unknown', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput).toEqual({});
  });

  it('consumes the preview so a second answer cannot re-apply it', () => {
    pending('t-once');
    const params = {
      toolUseId: 't-once', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG],
    };
    resolveDiffReview(connections(), params);
    expect(takePreview('t-once')).toBeUndefined();
  });

  it('writes what the reviewer typed, not what was proposed (#305)', () => {
    pending('t-edited');
    const typed = original.replace('debug: false', 'debug: MAYBE');
    resolveDiffReview(connections(), {
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

  it('applies an edit even when no hunk was ticked', () => {
    // Unticking everything then typing is an answer, not a denial: the text on
    // screen differs from the file, so there is something to write.
    pending('t-edited-none');
    const typed = original.replace('debug: false', 'debug: MAYBE');
    resolveDiffReview(connections(), {
      toolUseId: 't-edited-none', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [], editedContent: typed,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput.new_string).toContain('debug: MAYBE');
  });

  it('denies when the reviewer edited the proposal back to the original', () => {
    // Leaving the proposed side identical to the file means nothing to write.
    // Approving it would report success for an edit that never happened.
    pending('t-edited-back');
    resolveDiffReview(connections(), {
      toolUseId: 't-edited-back', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: original,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toContain(USER_DECLINED_PREFIX);
  });

  it('lets an untouched edit through unchanged', () => {
    // Typing and undoing leaves the proposal exactly as Claude wrote it, so the
    // original call should still go through rather than be synthesised.
    pending('t-edited-noop');
    resolveDiffReview(connections(), {
      toolUseId: 't-edited-noop', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedRanges: [R_DEBUG, R_TIMEOUT], editedContent: proposed,
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput).toEqual({});
  });

  it('quotes the request id the CLI is waiting on', () => {
    pending('t-id');
    resolveDiffReview(connections(), {
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

  function remember(id: string, path: string, oldC: string, newC: string) {
    rememberPreview(id, {
      filePath: path,
      oldContent: oldC,
      newContent: newC,
      hunks: computeHunks(oldC, newC)!,
      input: { file_path: path },
      toolName: 'Edit',
    });
  }

  it('resolves each request against its own file', () => {
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    remember('t-b', '/tmp/b.ts', fileB, fileBNew);

    // Answer B first, keeping only its first hunk.
    resolveDiffReview(connections(), {
      toolUseId: 't-b', controlRequestId: 'ctrl-b', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });
    const bInput = sendControlResponseToProcess.mock.calls[0][2].response.updatedInput;
    expect(bInput.file_path).toBe('/tmp/b.ts');
    expect(bInput.new_string).toContain('b: true');
    expect(bInput.new_string).not.toContain('c: 60');

    // A is untouched by that, and still resolvable on its own terms.
    resolveDiffReview(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });
    const aInput = sendControlResponseToProcess.mock.calls[1][2].response.updatedInput;
    expect(aInput.file_path).toBe('/tmp/a.ts');
  });

  it('answering one file does not consume another file\'s preview', () => {
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    remember('t-b', '/tmp/b.ts', fileB, fileBNew);

    resolveDiffReview(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });

    expect(takePreview('t-a')).toBeUndefined();
    expect(takePreview('t-b')).toBeDefined();
  });

  it('denying one file leaves the others pending', () => {
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    remember('t-b', '/tmp/b.ts', fileB, fileBNew);

    resolveDiffReview(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [],
    });

    expect(sendControlResponseToProcess.mock.calls[0][2].response.behavior).toBe('deny');
    expect(takePreview('t-b')).toBeDefined();
  });

  it('tells the chat which request was settled, not just that one was', () => {
    // Two prompts can be queued; clearing the wrong one would leave the user
    // answering a question that is already gone.
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    const conn = connections();

    resolveDiffReview(conn, {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedRanges: [R_DEBUG],
    });

    const [, , payload] = (conn as any).broadcastToSession.mock.calls[0];
    expect(payload).toMatchObject({ toolUseId: 't-a', controlRequestId: 'ctrl-a' });
  });
});
