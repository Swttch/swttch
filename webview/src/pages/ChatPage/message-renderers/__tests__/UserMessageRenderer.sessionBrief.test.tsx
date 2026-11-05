import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LoadedMessageDto } from '../../../../types';
import { LoadedMessageType, toInstance } from '../../../../dto/common';

vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: null }),
}));

const parentTitle = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('@/hooks/useSessionParentTitle', () => ({
  useSessionParentTitle: () => parentTitle.value,
}));

const sessionTitle = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('@/contexts/SessionContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/SessionContext')>()),
  useSessionContextOrNull: () => (sessionTitle.value ? { currentSession: { title: sessionTitle.value } } : null),
}));

import { UserMessageRenderer } from '../UserMessageRenderer';
import { ScrollFoldContext } from '../../ScrollFoldContext';

const BRIEF =
  '<system-reminder>\nLinked sessions now\n</system-reminder>\n\nBackground (from the session that started this one):\nThe repo is X.\n\nTask:\nFix the title.';

function userMessage(content: string): LoadedMessageDto {
  return toInstance(LoadedMessageDto, {
    type: LoadedMessageType.User,
    uuid: 'u-brief',
    message: { role: 'user', content },
  });
}

describe('UserMessageRenderer — a session started by another session', () => {
  it('draws the first message as a Task card and a Context card, not as one bubble', () => {
    render(<UserMessageRenderer message={userMessage(BRIEF)} />);
    expect(screen.getByText('Started from another session')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Context')).toBeInTheDocument();
    expect(screen.getByText('Fix the title.')).toBeInTheDocument();
    expect(screen.getByText('The repo is X.')).toBeInTheDocument();
    expect(screen.queryByText(/Background \(from the session/)).not.toBeInTheDocument();
  });

  it('names the session that started it when Desktop says which one', () => {
    parentTitle.value = '2026.11.04 Wed - v0.35.3 manager';
    try {
      render(<UserMessageRenderer message={userMessage(BRIEF)} />);
      expect(screen.getByText('Started from')).toBeInTheDocument();
      expect(screen.getByText('2026.11.04 Wed - v0.35.3 manager')).toBeInTheDocument();
      expect(screen.queryByText('Started from another session')).not.toBeInTheDocument();
    } finally {
      parentTitle.value = undefined;
    }
  });

  it('folds a card from its label and the whole thing from the first line', () => {
    render(<UserMessageRenderer message={userMessage(BRIEF)} />);
    fireEvent.click(screen.getByText('Task'));
    expect(screen.queryByText('Fix the title.')).not.toBeInTheDocument();
    expect(screen.getByText('The repo is X.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Started from another session'));
    expect(screen.queryByText('The repo is X.')).not.toBeInTheDocument();
  });

  it('offers "Show more" only when the text is taller than the cut, and "Show less" after opening', () => {
    const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400);
    const clientHeight = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    try {
      render(<UserMessageRenderer message={userMessage(BRIEF)} />);
      const [more] = screen.getAllByText('Show more');
      fireEvent.click(more);
      expect(screen.getByText('Show less')).toBeInTheDocument();
    } finally {
      scrollHeight.mockRestore();
      clientHeight.mockRestore();
    }
  });

  it('shows no "Show more" for short text', () => {
    render(<UserMessageRenderer message={userMessage(BRIEF)} />);
    expect(screen.queryByText('Show more')).not.toBeInTheDocument();
  });

  it('draws `code` in the cards the way the ordinary bubble does', () => {
    const withCode = BRIEF.replace('Fix the title.', 'Run `gh api repos` first.');
    const { container } = render(<UserMessageRenderer message={userMessage(withCode)} />);
    const code = container.querySelector('code');
    expect(code?.textContent).toBe('gh api repos');
    expect(screen.queryByText(/`gh api repos`/)).not.toBeInTheDocument();
  });

  it('rolls up with the scroll like an ordinary send while it is pinned', () => {
    const { container } = render(
      <ScrollFoldContext.Provider value={{ height: 120, restingHeight: 400 }}>
        <UserMessageRenderer message={userMessage(BRIEF)} />
      </ScrollFoldContext.Provider>,
    );
    const box = container.querySelector<HTMLElement>('[data-message-box]');
    expect(box?.style.height).toBe('120px');
    expect(box).toHaveClass('overflow-hidden');
  });

  it('is never folded below the floor nor above its resting height', () => {
    const { container, rerender } = render(
      <ScrollFoldContext.Provider value={{ height: -50, restingHeight: 400 }}>
        <UserMessageRenderer message={userMessage(BRIEF)} />
      </ScrollFoldContext.Provider>,
    );
    expect(container.querySelector<HTMLElement>('[data-message-box]')?.style.height).toBe('38px');
    rerender(
      <ScrollFoldContext.Provider value={{ height: 900, restingHeight: 400 }}>
        <UserMessageRenderer message={userMessage(BRIEF)} />
      </ScrollFoldContext.Provider>,
    );
    expect(container.querySelector<HTMLElement>('[data-message-box]')?.style.height).toBe('400px');
  });

  it('shows this session\'s own title beside the Task label, as Desktop does', () => {
    sessionTitle.value = '* Chat screen fixes';
    try {
      render(<UserMessageRenderer message={userMessage(BRIEF)} />);
      expect(screen.getByText('* Chat screen fixes')).toBeInTheDocument();
      expect(screen.getAllByText('* Chat screen fixes')).toHaveLength(1);
    } finally {
      sessionTitle.value = undefined;
    }
  });

  it('opens to the full height on a click on the box, and closes on another, even while folded', () => {
    const { container } = render(
      <ScrollFoldContext.Provider value={{ height: 60, restingHeight: 400 }}>
        <UserMessageRenderer message={userMessage(BRIEF)} />
      </ScrollFoldContext.Provider>,
    );
    const box = container.querySelector<HTMLElement>('[data-message-box]')!;
    expect(box.style.height).toBe('60px');
    fireEvent.click(screen.getByText('Fix the title.'));
    expect(box.style.height).toBe('');
    expect(box).toHaveClass('max-h-[80vh]');
    fireEvent.click(screen.getByText('Fix the title.'));
    expect(box.style.height).toBe('60px');
  });

  it('does not toggle the box from a click on a label button', () => {
    const { container } = render(<UserMessageRenderer message={userMessage(BRIEF)} />);
    fireEvent.click(screen.getByText('Task'));
    expect(container.querySelector('[data-message-box]')).not.toHaveClass('max-h-[80vh]');
  });

  it('keeps an ordinary message a bubble', () => {
    render(<UserMessageRenderer message={userMessage('Task: do it')} />);
    expect(screen.getByText('Task: do it')).toBeInTheDocument();
    expect(screen.queryByText('Context')).not.toBeInTheDocument();
  });
});
