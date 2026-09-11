import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentComposer } from '../AgentComposer';

function setup() {
  const onSend = vi.fn();
  render(<AgentComposer agentId="a40be17f1967a0861" onSend={onSend} />);
  const box = screen.getByPlaceholderText('Message this agent…') as HTMLTextAreaElement;
  return { onSend, box };
}

describe('AgentComposer', () => {
  it('sends to the agent it was given, and clears', () => {
    const { onSend, box } = setup();

    fireEvent.change(box, { target: { value: 'try the other directory' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('a40be17f1967a0861', 'try the other directory');
    expect(box.value).toBe('');
  });

  // Shift+Enter is how a multi-line message gets written, same as the main
  // composer.
  it('does not send on Shift+Enter', () => {
    const { onSend, box } = setup();

    fireEvent.change(box, { target: { value: 'first line' } });
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(box.value).toBe('first line');
  });

  it('ignores whitespace-only input from either route', () => {
    const { onSend, box } = setup();

    fireEvent.change(box, { target: { value: '   ' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(screen.getByTitle('Send to agent'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on the button too', () => {
    const { onSend, box } = setup();

    fireEvent.change(box, { target: { value: 'hello' } });
    fireEvent.click(screen.getByTitle('Send to agent'));

    expect(onSend).toHaveBeenCalledWith('a40be17f1967a0861', 'hello');
  });

  // Nothing is echoed here: the CLI records the message itself as the resumed
  // task_started's prompt, and the transcript above reads it back from there.
  // A local copy could disagree with that one, and would show up whether or not
  // the message was ever delivered.
  it('does not echo the message into its own view', () => {
    const { box } = setup();

    fireEvent.change(box, { target: { value: 'try the other directory' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(screen.queryByText('try the other directory')).not.toBeInTheDocument();
  });
});
