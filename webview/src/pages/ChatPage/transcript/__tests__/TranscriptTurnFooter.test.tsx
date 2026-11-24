import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TranscriptTurnFooter } from '../TranscriptTurnFooter';

const forkAtReply = vi.fn();

vi.mock('../../SendActionsContext', () => ({
  useSendActionsValue: () => ({ canForkReply: () => true, forkAtReply }),
}));
// The line is the reply footer's own concern; here only what the turn hands to it matters.
vi.mock('../TranscriptReplyFooter', () => ({
  TranscriptReplyFooter: (props: { copyText?: string; readAloudKey?: string; timestamp?: string; onFork?: () => void }) => (
    <div data-testid="footer" data-copy={props.copyText} data-key={props.readAloudKey} data-timestamp={props.timestamp} data-fork={props.onFork ? 'yes' : 'no'} />
  ),
}));

const reply = (uuid: string, timestamp: string, ...blocks: unknown[]) =>
  ({ type: 'assistant', uuid, timestamp, message: { role: 'assistant', content: blocks } }) as never;
const text = (value: string) => ({ type: 'text', text: value });

describe('TranscriptTurnFooter', () => {
  it('copies and reads the words of every reply of the turn, in order, and leaves the calls and thinking out', () => {
    const body = [
      reply('a1', '2026-11-24T01:00:00.000Z', { type: 'thinking', thinking: 'hmm' }, text('First.')),
      reply('a2', '2026-11-24T01:01:00.000Z', { type: 'tool_use', id: 't', name: 'Read', input: {} }),
      reply('a3', '2026-11-24T01:02:00.000Z', text('Second.'), text('Third.')),
    ];
    render(<TranscriptTurnFooter body={body} sectionKey="s1" running={false} />);
    const footer = screen.getByTestId('footer');
    expect(footer.getAttribute('data-copy')).toBe('First.\n\nSecond.\n\nThird.');
    expect(footer.getAttribute('data-key')).toBe('s1:turn');
  });

  it('is dated and forked at the last reply that said anything', () => {
    const body = [
      reply('a1', '2026-11-24T01:00:00.000Z', text('First.')),
      reply('a2', '2026-11-24T01:05:00.000Z', { type: 'tool_use', id: 't', name: 'Read', input: {} }),
    ];
    render(<TranscriptTurnFooter body={body} sectionKey="s1" running={false} />);
    const footer = screen.getByTestId('footer');
    expect(footer.getAttribute('data-timestamp')).toBe('2026-11-24T01:00:00.000Z');
    expect(footer.getAttribute('data-fork')).toBe('yes');
  });

  it('is drawn, with fork and the time but nothing to copy, under a turn that only asked a question', () => {
    const body = [reply('a1', '2026-11-24T01:00:00.000Z', { type: 'tool_use', id: 'q', name: 'AskUserQuestion', input: {} })];
    render(<TranscriptTurnFooter body={body} sectionKey="s1" running={false} />);
    const footer = screen.getByTestId('footer');
    expect(footer.getAttribute('data-copy')).toBeNull();
    expect(footer.getAttribute('data-fork')).toBe('yes');
    expect(footer.getAttribute('data-timestamp')).toBe('2026-11-24T01:00:00.000Z');
  });

  it('is not drawn while the turn runs, or when nothing was said', () => {
    const { rerender } = render(<TranscriptTurnFooter body={[reply('a1', '2026-11-24T01:00:00.000Z', text('Hi.'))]} sectionKey="s1" running />);
    expect(screen.queryByTestId('footer')).toBeNull();
    rerender(<TranscriptTurnFooter body={[reply('a1', '2026-11-24T01:00:00.000Z', { type: 'tool_use', id: 't', name: 'Read', input: {} })]} sectionKey="s1" running={false} />);
    expect(screen.queryByTestId('footer')).toBeNull();
  });
});
