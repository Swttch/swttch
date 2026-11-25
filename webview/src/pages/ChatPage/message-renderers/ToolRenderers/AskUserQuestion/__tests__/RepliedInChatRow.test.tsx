import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RepliedInChatRow } from '../RepliedInChatRow';

vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    i18n: { language: 'en' },
  }),
}));

const one = [{ question: 'What is your favourite colour?', header: 'Colour' }];
const two = [...one, { question: 'What is your favourite animal?', header: 'Animal' }];

describe('RepliedInChatRow', () => {
  it('names a single question by its header, in quotes', () => {
    render(<RepliedInChatRow questions={one} />);
    expect(screen.getByRole('button').textContent).toContain('“Colour”');
  });

  it('names several questions by how many there are, without quotes', () => {
    render(<RepliedInChatRow questions={two} />);
    const text = screen.getByRole('button').textContent ?? '';
    expect(text).toContain('askUserQuestion.card.questionCount:{"count":2}');
    expect(text).not.toContain('“');
  });

  it('opens each question with "replied in chat" under it on a click, and closes on the next', () => {
    render(<RepliedInChatRow questions={two} />);
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
});
