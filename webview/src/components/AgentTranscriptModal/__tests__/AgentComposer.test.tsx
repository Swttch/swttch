import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
// The composer reads one app setting (Enter vs Ctrl+Enter to send); the rest
// of SettingsProvider is irrelevant here.
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { useCtrlEnterToSend: false } }),
}));

import { AgentComposer } from '../AgentComposer';

/** Type into the contenteditable the way the editor's own input path sees it. */
function type(box: HTMLElement, text: string) {
  box.textContent = text;
  fireEvent.input(box);
}

function setup(overrides: { isRunning?: boolean; onStop?: () => void; unreachable?: boolean } = {}) {
  const onSend = vi.fn();
  const ui = (unreachable?: boolean) => (
    <AgentComposer
      agentId="a40be17f1967a0861"
      isRunning={overrides.isRunning ?? false}
      inputMode="ask_before_edit"
      onSend={onSend}
      onStop={overrides.onStop}
      unreachable={unreachable ?? overrides.unreachable}
    />
  );
  const view = render(ui());
  const box = document.querySelector('[contenteditable]') as HTMLElement;
  return { onSend, box, rerender: (unreachable: boolean) => view.rerender(ui(unreachable)) };
}

describe('AgentComposer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // A resume that finishes between two renders is never seen as `running`, and
  // a workflow agent's resume becomes a separate task whose `running` never
  // lands on this one. Either way nothing arrives to take the stop button back
  // down, and it would sit there offering to stop something already over.
  it('stops claiming to be working if the CLI never confirms it', () => {
    vi.useFakeTimers();
    const { box } = setup({ isRunning: false, onStop: vi.fn() });

    type(box, 'anyone there?');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(screen.getByTitle('Stop generating')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(20_000);
    });

    expect(screen.queryByTitle('Stop generating')).not.toBeInTheDocument();
    expect(screen.getByTitle('Send message')).toBeInTheDocument();
  });

  it('sends to the agent it was given, and clears', () => {
    const { onSend, box } = setup();

    type(box, 'try the other directory');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('a40be17f1967a0861', 'try the other directory');
    expect(box.textContent).toBe('');
  });

  // Shift+Enter is how a multi-line message gets written, same as the main
  // composer.
  it('does not send on Shift+Enter', () => {
    const { onSend, box } = setup();

    type(box, 'first line');
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });

    expect(onSend).not.toHaveBeenCalled();
    expect(box.textContent).toBe('first line');
  });

  it('ignores whitespace-only input from either route', () => {
    const { onSend, box } = setup();

    type(box, '   ');
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(screen.getByTitle('Send message'));

    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends on the button too', () => {
    const { onSend, box } = setup();

    type(box, 'hello');
    fireEvent.click(screen.getByTitle('Send message'));

    expect(onSend).toHaveBeenCalledWith('a40be17f1967a0861', 'hello');
  });

  // The button has to say "something is happening" the moment a message goes,
  // not when the CLI eventually reports the agent as running again — that round
  // trip takes a restart, and a send button in the meantime reads as if nothing
  // had happened.
  it('turns into stop as soon as a message is sent', () => {
    const onStop = vi.fn();
    const { box } = setup({ isRunning: false, onStop });

    type(box, 'one more thing');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(screen.getByTitle('Stop generating')).toBeInTheDocument();
    expect(screen.queryByTitle('Send message')).not.toBeInTheDocument();
  });

  // Stopping something that never started would otherwise leave the button
  // stuck on stop, since no "running" will ever arrive to clear it.
  it('goes back to send after stopping something that had not started', () => {
    const onStop = vi.fn();
    const { box } = setup({ isRunning: false, onStop });

    type(box, 'one more thing');
    fireEvent.keyDown(box, { key: 'Enter' });
    fireEvent.click(screen.getByTitle('Stop generating'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.getByTitle('Send message')).toBeInTheDocument();
  });

  // The send button becomes a stop button while the agent is working — the
  // same control the main composer offers, because it is the same component.
  it('offers stop instead of send while the agent is working', () => {
    const onStop = vi.fn();
    setup({ isRunning: true, onStop });

    fireEvent.click(screen.getByTitle('Stop generating'));

    expect(onStop).toHaveBeenCalledTimes(1);
    expect(screen.queryByTitle('Send message')).not.toBeInTheDocument();
  });

  // Typing means you want to send that, not stop what is running.
  it('goes back to send once there is something to send', () => {
    const { box } = setup({ isRunning: true, onStop: vi.fn() });

    type(box, 'one more thing');

    expect(screen.getByTitle('Send message')).toBeInTheDocument();
    expect(screen.queryByTitle('Stop generating')).not.toBeInTheDocument();
  });

  // Escape means "stop the agent" here, not "close the view you are typing in".
  it('stops the agent on Escape instead of letting the modal close', () => {
    const onStop = vi.fn();
    const { box } = setup({ isRunning: true, onStop });

    fireEvent.keyDown(box, { key: 'Escape' });

    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape alone when the agent is not working', () => {
    const onStop = vi.fn();
    const { box } = setup({ isRunning: false, onStop });

    fireEvent.keyDown(box, { key: 'Escape' });

    expect(onStop).not.toHaveBeenCalled();
  });

  // Neither has anywhere to go: SendMessage carries a plain string, and a
  // slash command addresses the session rather than the agent.
  it('offers neither attachments nor slash commands', () => {
    setup();

    expect(screen.queryByTitle('Attach file')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Slash commands')).not.toBeInTheDocument();
  });

  // An agent whose CLI session has ended cannot be resumed, so nothing said to
  // it would arrive. The box stays put saying why: the transcript above is
  // still worth reading, and a control that vanishes leaves the reader
  // wondering whether it was ever there.
  describe('when the agent can no longer be reached', () => {
    // Said under the box in the error's own colour: a refusal answers a
    // message that was just sent, and a greyed hint where the prompt used to be
    // is not an answer to anything.
    it('says why, and refuses to send', () => {
      const { onSend, box } = setup({ unreachable: true });

      expect(
        screen.getByText("This agent's session has ended — it can no longer be reached"),
      ).toBeInTheDocument();

      type(box, 'anyone there?');
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(onSend).not.toHaveBeenCalled();
    });

    // A refused send never becomes a running agent, so nothing would otherwise
    // clear the optimistic flag and the button would sit on stop for good.
    it('takes the stop button back down when the send turns out refused', () => {
      const { box, rerender } = setup({ isRunning: false, onStop: vi.fn() });

      type(box, 'anyone there?');
      fireEvent.keyDown(box, { key: 'Enter' });
      expect(screen.getByTitle('Stop generating')).toBeInTheDocument();

      rerender(true);

      expect(screen.queryByTitle('Stop generating')).not.toBeInTheDocument();
    });

    it('leaves the send button unusable', () => {
      setup({ unreachable: true });
      expect(screen.getByTitle('Send message')).toBeDisabled();
    });

    // Even mid-run: if it cannot be reached, stopping it is not on offer here
    // either, and a stop button would be the same lie in the other direction.
    it('does not offer stop either', () => {
      setup({ unreachable: true, isRunning: true, onStop: vi.fn() });
      expect(screen.queryByTitle('Stop generating')).not.toBeInTheDocument();
    });
  });

  // Nothing is echoed here: the CLI records the message itself as the resumed
  // task_started's prompt, and the transcript above reads it back from there.
  // A local copy could disagree with that one, and would show up whether or not
  // the message was ever delivered.
  it('does not echo the message into its own view', () => {
    const { box } = setup();

    type(box, 'try the other directory');
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(screen.queryByText('try the other directory')).not.toBeInTheDocument();
  });
});
