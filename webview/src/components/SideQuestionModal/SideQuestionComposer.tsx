import { useState, type KeyboardEvent as ReactKeyboardEvent, type Ref } from 'react';
import { useTranslation } from '@/i18n';
import { useSettings } from '@/contexts/SettingsContext';
import { RichInput } from '@/pages/ChatPage/ChatInput/RichInput';
import { ActionButtons } from '@/pages/ChatPage/ChatInput/ActionButtons';
import { InputFrame } from '@/pages/ChatPage/ChatInput/InputFrame';
import { useIMEComposition } from '@/pages/ChatPage/ChatInput/RichInput/useIMEComposition';
import { insertNewlineAtCursor } from '@/pages/ChatPage/ChatInput/RichInput/insertNewlineAtCursor';
import { composerBindings, composerKeyAction, ComposerKeyAction } from '@/utils/composerShortcut';
import { isMobile } from '@/config/environment';
import type { InputMode } from '@/types/chatInput';

interface Props {
  /** The session's mode, which colours the box and the send button. */
  inputMode: InputMode;
  /** Ask the typed text as a side question. */
  onSend: (question: string) => void;
  /** The editor, so the window can focus it on open. */
  editorRef: Ref<HTMLDivElement>;
}

/**
 * Type a side question. Built from the session input's own parts, as the agent
 * transcript's composer is, so the two boxes cannot drift apart.
 */
export function SideQuestionComposer(props: Props) {
  const { inputMode, onSend, editorRef } = props;
  const { t } = useTranslation('chat');
  const { settings } = useSettings();
  const [text, setText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const ime = useIMEComposition();

  const send = () => {
    const question = text.trim();
    if (!question) return;
    onSend(question);
    setText('');
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const isIMEComposing = ime.isComposing() || e.nativeEvent.isComposing;
    const action = composerKeyAction(
      {
        key: e.key,
        code: e.nativeEvent.code,
        keyCode: e.nativeEvent.keyCode,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        isComposing: isIMEComposing,
        isMobile: isMobile(),
      },
      composerBindings(settings),
    );
    if (action === ComposerKeyAction.Send) {
      e.preventDefault();
      send();
      return;
    }
    if (action === ComposerKeyAction.Newline) {
      e.preventDefault();
      insertNewlineAtCursor();
      setText(e.currentTarget.textContent ?? '');
    }
  };

  return (
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
          placeholder={t('sideQuestion.placeholder')}
          ariaLabel={t('sideQuestion.placeholder')}
        />
      }
      barEnd={
        <ActionButtons
          mode={inputMode}
          isActive={false}
          disabled={false}
          hasValue={!!text.trim()}
          onSubmit={send}
        />
      }
    />
  );
}
