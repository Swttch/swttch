import { describe, it, expect } from 'vitest';
import type { LoadedMessageDto } from '../../../../types';
import type { ToolCall } from '../buildSegments';
import { changedFilesOfCalls } from '../TranscriptFileChanges';

const message = { type: 'assistant', isStreaming: false } as unknown as LoadedMessageDto;

function call(id: string, name: string, input: Record<string, unknown>, result: 'ok' | 'failed' | 'stopped' | 'none' = 'ok'): ToolCall {
  const content =
    result === 'failed'
      ? [{ type: 'tool_result', tool_use_id: id, is_error: true, content: 'boom' }]
      : result === 'stopped'
        ? [{ type: 'tool_result', tool_use_id: id, is_error: true, content: "The user doesn't want to proceed with this tool use. The tool use was rejected." }]
        : [{ type: 'tool_result', tool_use_id: id, content: 'ok' }];
  const tool_result = result === 'none' ? undefined : ({ message: { content } } as unknown as LoadedMessageDto);
  return { toolUse: { id, name, input, tool_result } as unknown as ToolCall['toolUse'], message };
}

describe('changedFilesOfCalls', () => {
  it('lists each file once, in the order it was first changed, with its lines put in and taken out', () => {
    const files = changedFilesOfCalls([
      call('1', 'Edit', { file_path: '/a/dm.txt', old_string: 'l1', new_string: 'L1' }),
      call('2', 'Edit', { file_path: '/a/w1.txt', old_string: 'desktop', new_string: 'DESKTOP' }),
      call('3', 'Edit', { file_path: '/a/dm.txt', old_string: 'l2', new_string: 'L2' }),
    ]);
    expect(files.map((file) => file.path)).toEqual(['/a/dm.txt', '/a/w1.txt']);
    expect(files[0].stats).toEqual({ added: 2, removed: 2 });
    expect(files[1].stats).toEqual({ added: 1, removed: 1 });
  });

  it('leaves out a change the user turned down, one that failed, one still running, and other tools', () => {
    const files = changedFilesOfCalls([
      call('1', 'Edit', { file_path: '/a/x.txt', old_string: 'a', new_string: 'b' }, 'stopped'),
      call('2', 'Edit', { file_path: '/a/y.txt', old_string: 'a', new_string: 'b' }, 'failed'),
      call('3', 'Edit', { file_path: '/a/z.txt', old_string: 'a', new_string: 'b' }, 'none'),
      call('4', 'Bash', { command: 'ls' }),
      call('5', 'Write', { file_path: '/a/new.txt', content: 'one\ntwo\n' }),
    ]);
    expect(files.map((file) => file.path)).toEqual(['/a/new.txt']);
  });
});
