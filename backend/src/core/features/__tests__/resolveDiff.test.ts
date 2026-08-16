/**
 * The IDE's diff answers the CLI's permission request, so this is where a
 * mis-parse or a wrong default writes the wrong thing to disk.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendControlResponseToProcess = vi.fn();
vi.mock('../../claude-process', () => ({
  sendControlResponseToProcess: (...args: unknown[]) => sendControlResponseToProcess(...args),
}));

import { parseResolveDiffParams, resolveDiffFromIde } from '../resolveDiff';
import { rememberPreview, clearPreviews, takePreview } from '../diffPreview';
import { computeHunks } from '../hunks';
import { USER_DECLINED_PREFIX } from '../../../shared';

const original = ['debug: false', ...Array.from({ length: 8 }, (_, i) => `pad-${i}`), 'timeout: 30'].join('\n') + '\n';
const proposed = original.replace('debug: false', 'debug: true').replace('timeout: 30', 'timeout: 60');

function connections() {
  return { broadcastToSession: vi.fn() } as never;
}

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
    acceptedHunks: [0, 2],
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
    expect(parseResolveDiffParams({ ...good, acceptedHunks: undefined })?.acceptedHunks).toEqual([]);
  });

  it('drops non-integer entries rather than trusting the wire', () => {
    const parsed = parseResolveDiffParams({ ...good, acceptedHunks: [0, 'x', 1.5, null, 2] });
    expect(parsed?.acceptedHunks).toEqual([0, 2]);
  });
});

describe('resolveDiffFromIde', () => {
  it('keeping every hunk sends the request through unchanged', () => {
    const hunks = pending('t-all');
    resolveDiffFromIde(connections(), {
      toolUseId: 't-all', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedHunks: hunks.map((h) => h.index),
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    // Claude's own proposal already says this; amending would rewrite an Edit
    // into a synthesised one for no reason.
    expect(response.response.updatedInput).toEqual({});
  });

  it('keeping some rewrites the tool input to that subset', () => {
    pending('t-partial');
    resolveDiffFromIde(connections(), {
      toolUseId: 't-partial', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedHunks: [0],
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
    resolveDiffFromIde(connections(), {
      toolUseId: 't-none', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedHunks: [],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('deny');
    expect(response.response.message).toContain(USER_DECLINED_PREFIX);
  });

  it('answers a request we never previewed as a plain approval', () => {
    // No stored change means no basis to narrow it; inventing a decision the
    // user did not make would be worse than approving what they were shown.
    resolveDiffFromIde(connections(), {
      toolUseId: 't-unknown', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedHunks: [0],
    });

    const [, , response] = sendControlResponseToProcess.mock.calls[0];
    expect(response.response.behavior).toBe('allow');
    expect(response.response.updatedInput).toEqual({});
  });

  it('consumes the preview so a second answer cannot re-apply it', () => {
    pending('t-once');
    const params = {
      toolUseId: 't-once', controlRequestId: 'ctrl-1', sessionId: 'sess-1',
      acceptedHunks: [0],
    };
    resolveDiffFromIde(connections(), params);
    expect(takePreview('t-once')).toBeUndefined();
  });

  it('quotes the request id the CLI is waiting on', () => {
    pending('t-id');
    resolveDiffFromIde(connections(), {
      toolUseId: 't-id', controlRequestId: 'ctrl-42', sessionId: 'sess-9',
      acceptedHunks: [0],
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
    resolveDiffFromIde(connections(), {
      toolUseId: 't-b', controlRequestId: 'ctrl-b', sessionId: 'sess-1', acceptedHunks: [0],
    });
    const bInput = sendControlResponseToProcess.mock.calls[0][2].response.updatedInput;
    expect(bInput.file_path).toBe('/tmp/b.ts');
    expect(bInput.new_string).toContain('b: true');
    expect(bInput.new_string).not.toContain('c: 60');

    // A is untouched by that, and still resolvable on its own terms.
    resolveDiffFromIde(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedHunks: [0],
    });
    const aInput = sendControlResponseToProcess.mock.calls[1][2].response.updatedInput;
    expect(aInput.file_path).toBe('/tmp/a.ts');
  });

  it('answering one file does not consume another file\'s preview', () => {
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    remember('t-b', '/tmp/b.ts', fileB, fileBNew);

    resolveDiffFromIde(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedHunks: [0],
    });

    expect(takePreview('t-a')).toBeUndefined();
    expect(takePreview('t-b')).toBeDefined();
  });

  it('denying one file leaves the others pending', () => {
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    remember('t-b', '/tmp/b.ts', fileB, fileBNew);

    resolveDiffFromIde(connections(), {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedHunks: [],
    });

    expect(sendControlResponseToProcess.mock.calls[0][2].response.behavior).toBe('deny');
    expect(takePreview('t-b')).toBeDefined();
  });

  it('tells the chat which request was settled, not just that one was', () => {
    // Two prompts can be queued; clearing the wrong one would leave the user
    // answering a question that is already gone.
    remember('t-a', '/tmp/a.ts', fileA.old, fileA.new);
    const conn = connections();

    resolveDiffFromIde(conn, {
      toolUseId: 't-a', controlRequestId: 'ctrl-a', sessionId: 'sess-1', acceptedHunks: [0],
    });

    const [, , payload] = (conn as any).broadcastToSession.mock.calls[0];
    expect(payload).toMatchObject({ toolUseId: 't-a', controlRequestId: 'ctrl-a' });
  });
});
