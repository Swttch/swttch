import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useTranslation } from '@/i18n';
import { RichInput } from '@/pages/ChatPage/ChatInput/RichInput';
import { ActionButtons } from '@/pages/ChatPage/ChatInput/ActionButtons';
import { useIMEComposition } from '@/pages/ChatPage/ChatInput/RichInput/useIMEComposition';
import { shouldSubmitOnEnter } from '@/pages/ChatPage/ChatInput/shouldSubmitOnEnter';
import { insertNewlineAtCursor } from '@/pages/ChatPage/ChatInput/RichInput/insertNewlineAtCursor';
import { useSettings } from '@/contexts/SettingsContext';
import { isMobile } from '@/config/environment';
import { InputFrame } from '@/pages/ChatPage/ChatInput/InputFrame';
import type { InputMode } from '@/types/chatInput';

interface Props {
  /** The agent's address. */
  agentId: string;
  /** Whether this agent is working right now — the send button becomes stop. */
  isRunning: boolean;
  /** The session's mode, which colours the box and the send button. */
  inputMode: InputMode;
  onSend: (agentId: string, message: string) => void;
  /** Stop this agent. Omitted where there is no way to stop only this one. */
  onStop?: () => void;
}

/**
 * Say something to an agent, from the view of that agent.
 *
 * Literally the session input's own frame and parts: `InputFrame` draws the
 * box, and `RichInput` and `ActionButtons` fill it. Nothing about the shape is
 * restated here, so the two cannot drift — a change to the frame reaches both.
 *
 * The whole `ChatInput` could not come along. It is 905 lines with no props at
 * all, reading the session, the stream and the input state straight from
 * context, which is a fair design for the one composer a screen has and the
 * wrong shape for a second one pointed somewhere else.
 *
 * `RichInput` gets no `className`, exactly as it does there: what it is handed
 * is applied to its two stacked layers (the editable and the mirror that paints
 * under it), not to the box around them — so styling it that way misshapes the
 * editor instead of the container, and the container is what this file owns.
 *
 * Three of the main bar's controls are absent rather than inert. `SendMessage`
 * carries a plain string, so an attachment has nowhere to go; a slash command
 * addresses the session, not the agent in front of you; and the mode, model and
 * context-window tags all describe the session rather than this exchange.
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
  const [isFocused, setIsFocused] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
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
    <div className="shrink-0 px-3 pb-3 pt-1">
      <InputFrame
        mode={inputMode}
        isFocused={isFocused}
        editor={
          <RichInput
            ref={editorRef}
            ime={ime}
            value={text}
            onChange={setText}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={t('backgroundTasks.agentComposer.placeholder')}
            ariaLabel={t('backgroundTasks.agentComposer.placeholder')}
          />
        }
        barEnd={
          <ActionButtons
            mode={inputMode}
            isActive={isRunning}
            disabled={false}
            hasValue={!!text.trim()}
            onSubmit={send}
            onStop={onStop}
          />
        }
      />
    </div>
  );
}
