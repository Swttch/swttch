import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import type { LoadedMessageDto } from '../../../../types';
import type { ToolCall } from '../buildSegments';
import { commandStandIn, groupIntoRows, groupLabel, isExpandable, rowLabel, sumLineStats } from '../toolSummary';

// A translator that shows what it was asked for: the key's last part, then what it was given.
const t = ((key: string, options?: { count?: number; name?: string }) => {
  const short = key.split('.').pop();
  return options?.name ? `${short}:${options.name}` : options?.count !== undefined ? `${short}:${options.count}` : short;
}) as unknown as TFunction;

const message = { type: 'assistant', isStreaming: false } as unknown as LoadedMessageDto;

function call(id: string, name: string, input: Record<string, unknown> = {}, failed = false): ToolCall {
  const tool_result = failed
    ? ({ message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'boom' }] } } as unknown as LoadedMessageDto)
    : ({ message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } } as unknown as LoadedMessageDto);
  return { toolUse: { id, name, input, tool_result } as unknown as ToolCall['toolUse'], message };
}

/** The call, with the patch the CLI recorded for it in its result. */
function withPatch(c: ToolCall, lines: string[]): ToolCall {
  const result = c.toolUse.tool_result as unknown as Record<string, unknown>;
  result.toolUseResult = { structuredPatch: [{ oldStart: 1, newStart: 1, lines }] };
  return c;
}

describe('groupLabel', () => {
  it('counts files, not calls: one file edited three times is one file', () => {
    const calls = [call('1', 'Edit', { file_path: '/a/x.ts' }), call('2', 'Edit', { file_path: '/a/x.ts' }), call('3', 'Edit', { file_path: '/a/x.ts' })];
    expect(groupLabel(calls, t)).toBe('editedFiles:1');
  });

  it('counts several different files', () => {
    const calls = [call('1', 'Write', { file_path: '/a/x.ts' }), call('2', 'Write', { file_path: '/a/y.ts' })];
    expect(groupLabel(calls, t)).toBe('createdFiles:2');
  });

  it('writes reading and editing one file as one phrase', () => {
    const calls = [call('1', 'Bash'), call('2', 'Read', { file_path: '/a/x.ts' }), call('3', 'Edit', { file_path: '/a/x.ts' })];
    expect(groupLabel(calls, t)).toBe('ranCommands:1, readAndEditedFile:x.ts');
  });

  it('keeps reading and editing apart when they are about different files', () => {
    const calls = [call('1', 'Read', { file_path: '/a/x.ts' }), call('2', 'Edit', { file_path: '/a/y.ts' })];
    expect(groupLabel(calls, t)).toBe('readFile:x.ts, editedFiles:1');
  });

  it('adds how many calls failed', () => {
    const calls = [call('1', 'Bash'), call('2', 'Bash', {}, true)];
    expect(groupLabel(calls, t)).toBe('ranCommands:2 (failed:1)');
  });
});

describe('groupLabel for the browser pane', () => {
  const script = (id: string) => call(id, 'mcp__Claude_Browser__javascript_tool', { text: '1' });
  const computer = (id: string, action: string) => call(id, 'mcp__Claude_Browser__computer', { action });

  it('says what happened on the page, with how many times when it was more than once', () => {
    const calls = [script('1'), script('2'), computer('3', 'left_click'), computer('4', 'left_click'), computer('5', 'left_click'), computer('6', 'screenshot')];
    expect(groupLabel(calls, t)).toBe('times:2, times:3, capturedPage');
  });

  it('counts the browser calls it has no phrase for, and other tools, as other actions', () => {
    const calls = [call('1', 'mcp__Claude_Browser__read_page'), call('2', 'mcp__Claude_Browser__find'), call('3', 'mcp__something__else')];
    expect(groupLabel(calls, t)).toBe('otherActions:3');
  });

  it('names the browser tool for opening a page', () => {
    expect(groupLabel([call('1', 'mcp__Claude_Browser__navigate', { url: 'http://localhost' })], t)).toBe('pageOpened');
  });
});

describe('a click on the page', () => {
  const tAt = ((key: string, o?: { x?: string; y?: string }) => (key.endsWith('atPosition') ? `at ${o?.x}, ${o?.y}` : 'Clicked')) as unknown as TFunction;

  it('says where it was aimed and has nothing to open', () => {
    const click = call('1', 'mcp__Claude_Browser__computer', { action: 'left_click', coordinate: [190.4, 213] });
    expect(rowLabel(click, tAt).before).toBe('Clicked at 190, 213');
    expect(isExpandable(click)).toBe(false);
  });

  it('can be opened when the call names no point', () => {
    expect(isExpandable(call('1', 'mcp__Claude_Browser__computer', { action: 'left_click', ref: 'ref_1' }))).toBe(true);
  });
});

describe('groupIntoRows', () => {
  it('draws the edits of one file as one row, and keeps other calls as they are', () => {
    const a1 = call('1', 'Edit', { file_path: '/a/x.ts' });
    const b = call('2', 'Edit', { file_path: '/a/y.ts' });
    const a2 = call('3', 'Edit', { file_path: '/a/x.ts' });
    const w = call('4', 'Write', { file_path: '/a/x.ts' });
    const c1 = call('5', 'Bash');
    const c2 = call('6', 'Bash');
    expect(groupIntoRows([a1, b, a2, w, c1, c2])).toEqual([[a1, a2], [b], [w], [c1], [c2]]);
  });
});

describe('commandStandIn', () => {
  it('keeps the first plain words and marks that there is more', () => {
    expect(commandStandIn('cat >> notes.md <<EOF\nx\nEOF')).toBe('cat…');
    expect(commandStandIn('git commit -m "x"')).toBe('git commit…');
    expect(commandStandIn('git status')).toBe('git status');
    expect(commandStandIn('ls')).toBe('ls');
  });

  it('says nothing for a command that does not begin with a plain word', () => {
    expect(commandStandIn('/usr/bin/env x')).toBe('');
    expect(commandStandIn('')).toBe('');
  });

  it('names what a command begins with in its row, and a command with a description is that description', () => {
    const tWhat = ((key: string, o?: { what?: string }) => (o?.what ? `${key.split('.').pop()}:${o.what}` : key.split('.').pop())) as unknown as TFunction;
    expect(rowLabel(call('1', 'Bash', { command: 'cat >> a.txt' }), tWhat).before).toBe('ranCommandOf:cat…');
    expect(rowLabel(call('2', 'Bash', { command: 'cat >> a.txt', description: 'Show a' }), tWhat).before).toBe('Show a');
  });
});

describe('rowLabel', () => {
  it('leaves a failed command at its running wording, as the desktop app does', () => {
    expect(rowLabel(call('1', 'Bash', {}, true), t).before).toBe('runningCommand');
    expect(rowLabel(call('2', 'Bash'), t).before).toBe('ranCommand');
  });

  it('puts the name of a file where it falls in the label, so it can be drawn as a link', () => {
    const label = rowLabel(call('1', 'Edit', { file_path: '/a/b/x.ts' }), ((_key: string, o?: { name?: string }) => `Edited ${o?.name}!`) as unknown as TFunction);
    expect(label).toEqual({ before: 'Edited ', fileName: 'x.ts', after: '!' });
  });
});

describe('sumLineStats', () => {
  it('adds the lines of every file change in the group', () => {
    const calls = [
      call('1', 'Write', { file_path: '/a/x.ts', content: 'a\nb\nc' }),
      withPatch(call('2', 'Edit', { file_path: '/a/y.ts', old_string: 'a\nb', new_string: 'a\nb\nc\nd' }), [' a', '-b', '+b2', '+c', '+d']),
      call('3', 'Bash'),
    ];
    // The line "a" is only context: the edit put in three lines and took out one.
    expect(sumLineStats(calls)).toEqual({ added: 6, removed: 1 });
  });
});
