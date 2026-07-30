import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AskUserQuestionInputPanel } from '../AskUserQuestionInputPanel';
import type { PendingAskUserQuestion } from '@/hooks/usePendingAskUserQuestion';

const mockDeny = vi.fn();
const mockRespond = vi.fn();
const mockStop = vi.fn();

vi.mock('@/contexts/ApiContext', () => ({
  useApi: () => ({ tools: { deny: mockDeny, respond: mockRespond } }),
}));

vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ stop: mockStop }),
}));

const toolUse: PendingAskUserQuestion['toolUse'] = {
  id: 'tool-ask-1',
  name: 'AskUserQuestion',
  input: {
    questions: [
      {
        question: 'Which database should we use?',
        header: 'Database',
        multiSelect: false,
        options: [
          { label: 'PostgreSQL', description: 'Relational, battle-tested' },
          { label: 'SQLite', description: 'Zero-config, embedded' },
        ],
      },
    ],
  },
} as PendingAskUserQuestion['toolUse'];

function renderPanel() {
  const onDismiss = vi.fn();
  render(
    <AskUserQuestionInputPanel
      toolUse={toolUse}
      controlRequestId="ctrl-ask-1"
      onDismiss={onDismiss}
    />,
  );
  return { onDismiss };
}

beforeEach(() => {
  mockDeny.mockClear();
  mockRespond.mockClear();
  mockStop.mockClear();
});

describe('AskUserQuestionInputPanel — clickable "Esc to cancel"', () => {
  it('cancels when the "Esc to cancel" hint itself is clicked', () => {
    const { onDismiss } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Esc to cancel' }));

    expect(mockDeny).toHaveBeenCalledWith('tool-ask-1', 'ctrl-ask-1');
    expect(mockStop).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('AskUserQuestionInputPanel — collapse / expand', () => {
  it('hides the options and keeps a one-line summary bar once collapsed', () => {
    renderPanel();

    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));

    expect(screen.queryByText('PostgreSQL')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
    // The question header survives so the user knows what is waiting on them.
    expect(screen.getByText('Database')).toBeInTheDocument();
  });

  it('restores the options when expanded again', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByText('PostgreSQL')).toBeInTheDocument();
  });

  it('still cancels on Escape while collapsed', () => {
    const { onDismiss } = renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(mockDeny).toHaveBeenCalledWith('tool-ask-1', 'ctrl-ask-1');
    expect(onDismiss).toHaveBeenCalled();
  });
});
