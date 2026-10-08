import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const runControlRequestCommand = vi.fn();
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ runControlRequestCommand }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ inputMode: 'ask_before_edit' }),
}));
// The composer reads one app setting (Enter vs Ctrl+Enter to send).
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { useCtrlEnterToSend: false } }),
}));

import { SideQuestionWindow } from '../SideQuestionWindow';
import { SideQuestionStatus, type SideQuestionExchange } from '@/contexts/SideQuestionContext';

function exchange(overrides: Partial<SideQuestionExchange> = {}): SideQuestionExchange {
  return {
    requestId: 'r1',
    sessionId: 's1',
    question: 'why?',
    answer: null,
    status: SideQuestionStatus.Pending,
    delivered: false,
    askedAt: 0,
    ...overrides,
  };
}

function setup(exchanges: SideQuestionExchange[] = []) {
  const onClose = vi.fn();
  const onClear = vi.fn();
  render(<SideQuestionWindow exchanges={exchanges} onClose={onClose} onClear={onClear} />);
  return { onClose, onClear };
}

/** Type into the contenteditable the way the editor's own input path sees it. */
function type(box: HTMLElement, text: string) {
  box.textContent = text;
  fireEvent.input(box);
}

describe('SideQuestionWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no exchanges', () => {
    setup();
    expect(screen.getByText(/Ask anything about what is going on/)).toBeInTheDocument();
  });

  it('shows the question and a thinking indicator while pending', () => {
    setup([exchange()]);
    expect(screen.getByText('why?')).toBeInTheDocument();
    expect(screen.getAllByText('Thinking…').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Ask anything about what is going on/)).not.toBeInTheDocument();
  });

  it('shows the answer once answered', () => {
    setup([exchange({ status: SideQuestionStatus.Answered, answer: 'because of reasons' })]);
    expect(screen.getByText('because of reasons')).toBeInTheDocument();
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  });

  it('shows the error text when the question failed', () => {
    setup([exchange({ status: SideQuestionStatus.Failed, answer: 'Command failed: boom' })]);
    expect(screen.getByText('Command failed: boom')).toBeInTheDocument();
  });

  it('shows a notice when the question failed without an error text', () => {
    setup([exchange({ status: SideQuestionStatus.Failed })]);
    expect(screen.getByText(/Couldn't get an answer from Claude/)).toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes when the scrim is clicked, but not when the dialog is', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    const scrim = screen.getByRole('dialog').parentElement!.parentElement!;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers the clear button only when there are exchanges', () => {
    const { unmount } = render(
      <SideQuestionWindow exchanges={[]} onClose={vi.fn()} onClear={vi.fn()} />,
    );
    expect(screen.queryByTitle('Clear side questions')).not.toBeInTheDocument();
    unmount();

    const { onClear } = setup([exchange()]);
    fireEvent.click(screen.getByTitle('Clear side questions'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('sends the typed text as a /btw command with the session mode, and clears the input', () => {
    setup();
    const box = document.querySelector('[contenteditable]') as HTMLElement;

    type(box, 'what is going on?');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(runControlRequestCommand).toHaveBeenCalledWith('/btw what is going on?', 'ask_before_edit');
    expect(box.textContent).toBe('');
  });
});
