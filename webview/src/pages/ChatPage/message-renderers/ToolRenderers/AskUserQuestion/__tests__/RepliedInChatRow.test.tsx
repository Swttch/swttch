import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepliedInChatRow } from '../RepliedInChatRow';

const forkAtReply = vi.fn();

vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    i18n: { language: 'en' },
  }),
}));
vi.mock('../../../../SendActionsContext', () => ({
  useSendActionsValue: () => ({ canForkReply: () => true, forkAtReply }),
}));
// The line under it is the reply footer's own concern; here only what the row hands to it matters.
vi.mock('../../../../transcript/TranscriptReplyFooter', () => ({
  TranscriptReplyFooter: (props: { shown?: boolean; onFork?: () => void; timestamp?: string }) => (
    <div data-testid="footer" data-shown={props.shown ? 'yes' : 'no'} data-fork={props.onFork ? 'yes' : 'no'} data-timestamp={props.timestamp} />
  ),
}));

const message = { uuid: 'u-1', timestamp: '2026-11-18T03:00:00.000Z' } as never;
const one = [{ question: 'What is your favourite colour?', header: 'Colour' }];
const two = [...one, { question: 'What is your favourite animal?', header: 'Animal' }];

describe('RepliedInChatRow', () => {
  it('names a single question by its header, in quotes', () => {
    render(<RepliedInChatRow questions={one} message={message} />);
    expect(screen.getByRole('button').textContent).toContain('“Colour”');
  });

  it('names several questions by how many there are, without quotes', () => {
    render(<RepliedInChatRow questions={two} message={message} />);
    const text = screen.getByRole('button').textContent ?? '';
    expect(text).toContain('askUserQuestion.card.questionCount:{"count":2}');
    expect(text).not.toContain('“');
  });

  it('opens each question with "replied in chat" under it on a click, and closes on the next', () => {
    render(<RepliedInChatRow questions={two} message={message} />);
    expect(screen.queryByTestId('question-replied-in-chat-list')).toBeNull();
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(screen.getByRole('button'));
    const list = screen.getByTestId('question-replied-in-chat-list');
    expect(list.textContent).toContain('What is your favourite colour?');
    expect(list.textContent).toContain('What is your favourite animal?');
    expect(list.textContent?.split('askUserQuestion.card.repliedInChat').length).toBe(3);
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByTestId('question-replied-in-chat-list')).toBeNull();
  });

  it('gives the line under it fork and the time, and keeps it on screen only while open', () => {
    render(<RepliedInChatRow questions={one} message={message} />);
    const footer = screen.getByTestId('footer');
    expect(footer.getAttribute('data-fork')).toBe('yes');
    expect(footer.getAttribute('data-timestamp')).toBe('2026-11-18T03:00:00.000Z');
    expect(footer.getAttribute('data-shown')).toBe('no');

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('footer').getAttribute('data-shown')).toBe('yes');
  });
});
