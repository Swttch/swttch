import { describe, it, expect } from 'vitest';
import { mergeToolResults } from '../mergeToolResults';
import { LoadedMessageType, MessageRole } from '../../../dto/common';
import { ContentBlockType } from '../../../dto/message/ContentBlockDto';
import type { LoadedMessageDto } from '../../../types';

function assistantWithTool(uuid: string, toolId: string, name: string): LoadedMessageDto {
  return {
    uuid,
    type: LoadedMessageType.Assistant,
    message: {
      role: MessageRole.Assistant,
      content: [
        { type: 'tool_use', id: toolId, name, input: { command: 'ls' } },
      ],
    },
    timestamp: '2026-01-01T00:00:00.000Z',
  } as unknown as LoadedMessageDto;
}

function toolResultUser(
  uuid: string,
  toolId: string,
  content: string | Array<{ type: string; text: string }>,
): LoadedMessageDto {
  return {
    uuid,
    type: LoadedMessageType.User,
    message: {
      role: MessageRole.User,
      content: [
        { type: 'tool_result', tool_use_id: toolId, content },
      ],
    },
    timestamp: '2026-01-01T00:00:01.000Z',
  } as unknown as LoadedMessageDto;
}

function getToolUseBlock(msg: LoadedMessageDto) {
  const content = msg.message?.content as unknown as Array<Record<string, unknown>>;
  return content.find(b => b.type === ContentBlockType.ToolUse) as Record<string, unknown> | undefined;
}

describe('mergeToolResults', () => {
  it('merges a tool_result into the preceding assistant tool_use block (string content)', () => {
    const messages = [
      assistantWithTool('a1', 'tool1', 'Bash'),
      toolResultUser('u1', 'tool1', 'command output here'),
    ];

    const merged = mergeToolResults(messages);

    // the tool_result-only user message must be hidden from the rendered list
    expect(merged.find(m => m.uuid === 'u1')).toBeUndefined();

    // the assistant message remains, and its tool_use block now carries the result
    const assistant = merged.find(m => m.uuid === 'a1');
    expect(assistant).toBeDefined();
    const toolUseBlock = getToolUseBlock(assistant!);
    expect(toolUseBlock).toBeDefined();
    expect(toolUseBlock!.tool_result).toBeDefined();
    expect((toolUseBlock!.tool_result as LoadedMessageDto).uuid).toBe('u1');
  });

  it('merges a tool_result whose content is a content-block array', () => {
    const messages = [
      assistantWithTool('a1', 'tool1', 'Task'),
      toolResultUser('u1', 'tool1', [{ type: 'text', text: 'sub-agent done' }]),
    ];

    const merged = mergeToolResults(messages);

    const assistant = merged.find(m => m.uuid === 'a1')!;
    const toolUseBlock = getToolUseBlock(assistant);
    expect(toolUseBlock!.tool_result).toBeDefined();
  });

  it('does not mutate the original messages array or its blocks', () => {
    const messages = [
      assistantWithTool('a1', 'tool1', 'Bash'),
      toolResultUser('u1', 'tool1', 'output'),
    ];

    mergeToolResults(messages);

    // original assistant block must stay untouched (no in-place mutation)
    const originalBlock = getToolUseBlock(messages[0]);
    expect(originalBlock!.tool_result).toBeUndefined();
  });

  it('attaches a <task-notification> to its Workflow tool_use and hides the raw bubble', () => {
    const notif = [
      '<task-notification>',
      '<task-id>w123</task-id>',
      '<tool-use-id>tool1</tool-use-id>',
      '<output-file>/tmp/x.output</output-file>',
      '<status>completed</status>',
      '<summary>Dynamic workflow "demo" completed</summary>',
      '<result>{"ok":true}</result>',
      '<usage><agent_count>5</agent_count><subagent_tokens>171500</subagent_tokens><tool_uses>5</tool_uses><duration_ms>7000</duration_ms></usage>',
      '</task-notification>',
    ].join('\n');
    const notifMsg = {
      uuid: 'u1',
      type: LoadedMessageType.User,
      message: { role: MessageRole.User, content: notif },
      timestamp: '2026-01-01T00:00:02.000Z',
    } as unknown as LoadedMessageDto;

    const merged = mergeToolResults([assistantWithTool('a1', 'tool1', 'Workflow'), notifMsg]);

    // raw <task-notification> bubble is hidden
    expect(merged.find(m => m.uuid === 'u1')).toBeUndefined();

    const block = getToolUseBlock(merged.find(m => m.uuid === 'a1')!);
    const wf = block!.workflowNotification as Record<string, any> | undefined;
    expect(wf).toBeDefined();
    expect(wf!.status).toBe('completed');
    expect(wf!.toolUseId).toBe('tool1');
    expect(wf!.summary).toContain('completed');
    expect(wf!.usage!.agent_count).toBe(5);
    expect(wf!.usage!.subagent_tokens).toBe(171500);
  });

  it('keeps a tool_result visible when its tool_use is not loaded (split by paging)', () => {
    // Only the tool_result user message is present — its tool_use sits on an
    // older, not-yet-loaded page. It must stay visible rather than vanish.
    const orphan = toolResultUser('u1', 'tool-missing', 'output from an older page');

    const merged = mergeToolResults([orphan]);

    expect(merged.find(m => m.uuid === 'u1')).toBe(orphan);
  });

  it('keeps non-tool messages as their original references', () => {
    const userMsg = {
      uuid: 'u0',
      type: LoadedMessageType.User,
      message: { role: MessageRole.User, content: 'hi' },
      timestamp: '2026-01-01T00:00:00.000Z',
    } as unknown as LoadedMessageDto;

    const merged = mergeToolResults([userMsg]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(userMsg); // same reference → MessageBubble memo bailout holds
  });
});
