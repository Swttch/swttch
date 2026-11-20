import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { toInstance } from '@/dto/common';
import { LoadedMessageDto } from '@/types';
import { useAgentRearmKey } from '../agentRearmKey';

const user = (uuid: string) => toInstance(LoadedMessageDto, { type: 'user', uuid, message: { role: 'user', content: uuid } });
const reply = (uuid: string) =>
  toInstance(LoadedMessageDto, { type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text: uuid }] } });

describe('useAgentRearmKey', () => {
  it('is null for a record nobody has sent anything to', () => {
    const { result } = renderHook(({ m }) => useAgentRearmKey(m, 0), { initialProps: { m: [reply('r1')] } });
    expect(result.current).toBeNull();
  });

  it('changes when the newest message the user sent changes', () => {
    const { result, rerender } = renderHook(({ m }) => useAgentRearmKey(m, 0), { initialProps: { m: [user('u1'), reply('r1')] } });
    const first = result.current;
    expect(first).toBe('u1#0');
    rerender({ m: [user('u1'), reply('r1'), user('u2'), reply('r2')] });
    expect(result.current).toBe('u2#0');
  });

  it('does not take the prompt found by loading earlier for a send just made', () => {
    // The newest page holds only replies; the page before it brings the prompt.
    const { result, rerender } = renderHook(({ m }) => useAgentRearmKey(m, 0), { initialProps: { m: [reply('r1'), reply('r2')] } });
    expect(result.current).toBeNull();
    rerender({ m: [user('u1'), reply('r1'), reply('r2')] });
    expect(result.current).toBeNull();
    // ...and stays that way on the renders that follow.
    rerender({ m: [user('u1'), reply('r1'), reply('r2')] });
    expect(result.current).toBeNull();
  });

  it('still takes a send made after that, and a reply arriving at the end does not switch the prompt on', () => {
    const { result, rerender } = renderHook(({ m }) => useAgentRearmKey(m, 0), { initialProps: { m: [reply('r1')] } });
    rerender({ m: [user('u1'), reply('r1')] });
    expect(result.current).toBeNull();
    rerender({ m: [user('u1'), reply('r1'), reply('r2')] }); // a new reply at the end
    expect(result.current).toBeNull();
    rerender({ m: [user('u1'), reply('r1'), reply('r2'), user('u2')] }); // a real send
    expect(result.current).toBe('u2#0');
  });

  it('counts the sends made from the modal', () => {
    const { result, rerender } = renderHook(({ m, n }) => useAgentRearmKey(m, n), { initialProps: { m: [reply('r1')], n: 0 } });
    expect(result.current).toBeNull();
    rerender({ m: [reply('r1')], n: 1 });
    expect(result.current).toBe('#1');
  });
});
