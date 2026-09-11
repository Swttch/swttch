import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { LoadedMessageDto } from '@/types';

const messages: LoadedMessageDto[] = [];
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ messages }),
}));

import { useUnreachableAgents } from '../useUnreachableAgents';

/** A tool_result carrying `text`, in the shape the CLI's own results arrive in. */
function toolResult(text: string): LoadedMessageDto {
  return {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text }] }] },
  } as unknown as LoadedMessageDto;
}

/** The same, with the content as a bare string rather than blocks. */
function toolResultPlain(text: string): LoadedMessageDto {
  return {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] },
  } as unknown as LoadedMessageDto;
}

/** The CLI's own wording, as recorded. */
function refusal(agentId: string): string {
  return JSON.stringify({
    success: false,
    message: `Agent "${agentId}" could not be resumed: No transcript found for agent ID: ${agentId}. If you read this id in a message from another Claude Code process, it never ran in this session.`,
  });
}

function render(entries: LoadedMessageDto[]) {
  messages.length = 0;
  messages.push(...entries);
  return renderHook(() => useUnreachableAgents()).result.current;
}

describe('useUnreachableAgents', () => {
  it('finds nothing in a conversation with no refusals', () => {
    expect(render([toolResult('all good')]).size).toBe(0);
  });

  it('picks the agent id out of a refusal', () => {
    const ids = render([toolResult(refusal('ab5ae1f1b104ce2f7'))]);
    expect([...ids]).toEqual(['ab5ae1f1b104ce2f7']);
  });

  it('reads a result whose content is a plain string too', () => {
    expect(render([toolResultPlain(refusal('a40be17f1967a0861'))]).has('a40be17f1967a0861')).toBe(true);
  });

  it('collects every agent refused across the conversation', () => {
    const ids = render([
      toolResult(refusal('a1')),
      toolResult('unrelated'),
      toolResult(refusal('a2')),
    ]);
    expect([...ids].sort()).toEqual(['a1', 'a2']);
  });

  // Matched on the wording, not on success:false — any number of transient
  // problems produce that, and none of them mean the agent is gone for good.
  it('ignores a failure that is not a refusal to resume', () => {
    expect(render([toolResult(JSON.stringify({ success: false, message: 'Something else' }))]).size).toBe(0);
  });

  // This is read from the conversation precisely so a reloaded task is covered:
  // the backend's tracker never sees those, and they are the ones most likely
  // to be refused.
  it('does not care which message the refusal arrived in', () => {
    const ids = render([toolResult('older traffic'), toolResult(refusal('a7876c7eab66a65be'))]);
    expect(ids.has('a7876c7eab66a65be')).toBe(true);
  });
});
