import { useRef } from 'react';
import { useTranslation } from '@/i18n';
import { VoiceMode } from '@/types/settings';
import { DictationState } from './hooks/useDictation';

interface Props {
  state: DictationState;
  /** Input loudness 0..1, used to make the button breathe while listening. */
  level: number;
  mode: VoiceMode;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The microphone button.
 *
 * Two interaction modes, matching what the other Claude Code clients offer:
 * hold-to-talk (default) for a quick sentence, and tap-to-toggle for dictating
 * something long without holding a mouse button down. Hold mode listens on
 * pointer down/up rather than click, because a click only fires after release —
 * by which time the user has already finished speaking.
 */
export function MicButton(props: Props) {
  const { state, level, mode, disabled, onStart, onStop } = props;
  const { t } = useTranslation('chat');
  const holdingRef = useRef(false);

  const isListening = state === DictationState.Listening;
  const isBusy = state === DictationState.Starting || state === DictationState.Finishing;
  const isActive = isListening || isBusy;

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || mode !== VoiceMode.HOLD) return;
    // Keep receiving events if the pointer slides off the button mid-sentence;
    // without capture, moving off it would drop the release and leave the
    // microphone open.
    event.currentTarget.setPointerCapture(event.pointerId);
    holdingRef.current = true;
    onStart();
  }

  function handlePointerUp() {
    if (mode !== VoiceMode.HOLD || !holdingRef.current) return;
    holdingRef.current = false;
    onStop();
  }

  function handleClick() {
    if (disabled || mode !== VoiceMode.TAP) return;
    if (isListening) onStop();
    else if (!isBusy) onStart();
  }

  const title = isListening
    ? t('chatInput.dictation.stop')
    : mode === VoiceMode.HOLD
      ? t('chatInput.dictation.holdToTalk')
      : t('chatInput.dictation.start');

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={title}
      aria-pressed={isListening}
      title={title}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      className={`relative flex items-center justify-center w-6 h-6 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        isActive
          ? 'text-state-error-fg bg-state-error-bg'
          : 'text-text-tertiary hover:text-text-secondary hover:bg-surface-hover'
      }`}
    >
      {/* A ring that tracks input loudness, so "recording" and "recording
          silence" look different — the usual failure is a muted or wrong
          input device, which is otherwise invisible until no text appears. */}
      {isListening && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-state-error-fg opacity-60"
          style={{ transform: `scale(${1 + Math.min(level, 1) * 0.6})` }}
        />
      )}
      {isBusy && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full border border-current opacity-40 animate-ping"
        />
      )}
      <svg
        className="w-[14px] h-[14px]"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    </button>
  );
}
