import { useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from '@/i18n';
import { RichInput } from '@/pages/ChatPage/ChatInput/RichInput';
import { ActionButtons } from '@/pages/ChatPage/ChatInput/ActionButtons';
import { useIMEComposition } from '@/pages/ChatPage/ChatInput/RichInput/useIMEComposition';
import { shouldSubmitOnEnter } from '@/pages/ChatPage/ChatInput/shouldSubmitOnEnter';
import { insertNewlineAtCursor } from '@/pages/ChatPage/ChatInput/RichInput/insertNewlineAtCursor';
import { useSettings } from '@/contexts/SettingsContext';
import { isMobile } from '@/config/environment';
import type { InputMode } from '@/types/chatInput';

interface Props {
  /** The agent's address. */
  agentId: string;
  /** Whether this agent is working right now — the send button becomes stop. */
  isRunning: boolean;
  /** The session's mode, borrowed only for the send button's colour. */
  inputMode: InputMode;
  onSend: (agentId: string, message: string) => void;
  /** Stop this agent. Omitted where there is no way to stop only this one. */
  onStop?: () => void;
}

/**
 * Say something to an agent, from the view of that agent.
 *
 * Built from the main composer's own parts — `RichInput` and `ActionButtons`,
 * both plain props components with no session context of their own — so the
 * editor behaves the same in both places: IME composition that survives JCEF,
 * Enter to send with Shift+Enter for a newline, a box that grows with the text,
 * and a send button that turns into a stop button while the agent is working.
 *
 * The whole `ChatInput` could not come along. It is 905 lines with no props at
 * all, reading the session, the stream and the input state straight from
 * context, which is a fair design for the one composer a screen has and the
 * wrong shape for a second one pointed somewhere else.
 *
 * Two of its controls are deliberately absent rather than inert. `SendMessage`
 * carries a plain string, so an attachment has nowhere to go; and a slash
 * command addresses the session, not the agent standing in front of you.
 *
 * Nothing is echoed here. Resuming an agent makes the CLI fire a fresh
 * `task_started` carrying this text as its `prompt`, so the message appears in
 * the transcript above from the CLI's own record rather than from a second copy
 * of ours that could disagree with it.
 */
export function AgentComposer(props: Props) {
  const { agentId, isRunning, inputMode, onSend, onStop } = props;
  const { t } = useTranslation('chat');
  const { settings } = useSettings();
  const [text, setText] = useState('');
  // Owned here so this keydown handler and the editor agree on one source of
  // truth for composition — under JCEF the native `isComposing` flag lies.
  const ime = useIMEComposition();

  const send = () => {
    const message = text.trim();
    if (!message) return;
    onSend(agentId, message);
    setText('');
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Escape stops the agent rather than closing the modal. Closing the view
    // you are typing in is not what Escape means while an agent is working,
    // and the modal's own handler sits on `window` — so the native event has
    // to be stopped, not just the React one.
    if (e.key === 'Escape' && isRunning && onStop) {
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      onStop();
      return;
    }

    // Enter is double-detected (key OR keyCode 13) and the composition truth is
    // ours OR'd with the native flag, exactly as the main composer does it —
    // under JCEF a non-English layout surfaces Enter with a different `key`,
    // and the native `isComposing` alone is unreliable (issue #215).
    const isEnterKey = e.key === 'Enter' || e.nativeEvent.keyCode === 13;
    if (!isEnterKey) return;

    const isIMEComposing = ime.isComposing() || e.nativeEvent.isComposing;
    const willSubmit = shouldSubmitOnEnter(
      {
        key: e.key,
        keyCode: e.nativeEvent.keyCode,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        isComposing: isIMEComposing,
        isMobile: isMobile(),
      },
      settings.useCtrlEnterToSend ?? false,
    );
    if (willSubmit) {
      e.preventDefault();
      send();
      return;
    }
    // Not a submit: write the line break ourselves, since under JCEF a plain
    // Enter is otherwise swallowed as an IME commit. While composing we leave
    // the keystroke to the composition.
    if (!isIMEComposing) {
      e.preventDefault();
      insertNewlineAtCursor();
      setText(e.currentTarget.textContent ?? '');
    }
  };

  return (
    <div className="shrink-0 border-t border-border-subtle px-2 py-2">
      <div className="flex items-end gap-2">
        <RichInput
          value={text}
          onChange={setText}
          onKeyDown={handleKeyDown}
          ime={ime}
          placeholder={t('backgroundTasks.agentComposer.placeholder')}
          ariaLabel={t('backgroundTasks.agentComposer.send')}
          className="flex-1 max-h-32 overflow-y-auto rounded-md border border-border-default bg-surface-base px-2 py-1.5 text-[0.8461rem]"
        />
        <ActionButtons
          mode={inputMode}
          isActive={isRunning}
          disabled={false}
          hasValue={!!text.trim()}
          onSubmit={send}
          onStop={onStop}
        />
      </div>
    </div>
  );
}
