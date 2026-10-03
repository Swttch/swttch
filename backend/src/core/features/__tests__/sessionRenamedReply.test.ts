import { describe, it, expect } from 'vitest';
import { renamedSessionTitle } from '../sessionRenamedReply';

function assistantSays(text: string): Record<string, unknown> {
  return { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } };
}

describe('renamedSessionTitle', () => {
  it('reads the new name out of the CLI answer to /rename', () => {
    expect(renamedSessionTitle(assistantSays('Session renamed to: Release checklist'))).toBe('Release checklist');
  });

  it('keeps a name that holds a colon or non-ASCII text as it is', () => {
    expect(renamedSessionTitle(assistantSays('Session renamed to: Issue #384: reconnect problem'))).toBe(
      'Issue #384: reconnect problem',
    );
  });

  it('is null for any other assistant text', () => {
    expect(renamedSessionTitle(assistantSays('Here is what I found.'))).toBeNull();
  });

  it('is null when the answer carries no name', () => {
    expect(renamedSessionTitle(assistantSays('Session renamed to:   '))).toBeNull();
  });

  it('is null for events that are not assistant messages', () => {
    expect(renamedSessionTitle({ type: 'system', subtype: 'session_title_changed', title: 'My name' })).toBeNull();
    expect(renamedSessionTitle({ type: 'result' })).toBeNull();
  });

  it('is null for an assistant message without text content', () => {
    expect(renamedSessionTitle({ type: 'assistant' })).toBeNull();
    expect(renamedSessionTitle({ type: 'assistant', message: { content: 'plain string' } })).toBeNull();
    expect(renamedSessionTitle({ type: 'assistant', message: { content: [{ type: 'tool_use' }] } })).toBeNull();
  });
});
