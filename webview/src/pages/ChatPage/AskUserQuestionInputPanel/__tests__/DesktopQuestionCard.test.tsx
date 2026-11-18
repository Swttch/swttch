import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesktopQuestionCard } from '../DesktopQuestionCard';

vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    i18n: { language: 'en' },
  }),
}));

const LONG =
  '#2: A generic question that has a very long title and goes on well past what one line of the card can hold, so that the person has to read all of it to answer';

function formFor(question: string) {
  return {
    currentIndex: 1,
    currentQuestion: { question, header: 'Q', multiSelect: false, options: [] },
    currentField: { selected: [] as string[] },
    isOtherSelected: () => false,
    allOptionsFor: () => [{ label: 'Option A', description: 'A' }],
    isLastTab: false,
    canSubmitCurrent: false,
    setCurrentIndex: vi.fn(),
    setOtherText: vi.fn(),
    selectOption: vi.fn(),
  } as never;
}

describe('DesktopQuestionCard heading (#707)', () => {
  it('writes the whole question, however long, and does not cut it to one line', () => {
    render(<DesktopQuestionCard form={formFor(LONG)} total={4} onSubmit={vi.fn()} onCancel={vi.fn()} onOtherKeyDown={vi.fn()} />);
    const heading = screen.getByTestId('question-heading');
    expect(heading.textContent).toBe(LONG);
    expect(heading.className).not.toContain('truncate');
    expect(heading.className).toContain('break-words');
  });

  it('keeps the progress and the arrows beside the question', () => {
    render(<DesktopQuestionCard form={formFor(LONG)} total={4} onSubmit={vi.fn()} onCancel={vi.fn()} onOtherKeyDown={vi.fn()} />);
    expect(screen.getByText('askUserQuestion.card.progress:{"current":2,"total":4}')).toBeTruthy();
  });

  it('is at least as tall as the desktop app band for a short question, and grows for a long one', () => {
    render(<DesktopQuestionCard form={formFor('Short?')} total={1} onSubmit={vi.fn()} onCancel={vi.fn()} onOtherKeyDown={vi.fn()} />);
    const band = screen.getByTestId('question-heading').parentElement as HTMLElement;
    expect(band.className).toContain('min-h-[2.99rem]');
    expect(band.className).not.toMatch(/(^|\s)h-\[/);
  });
});
