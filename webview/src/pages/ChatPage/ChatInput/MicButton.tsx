import { useRef } from 'react';
import { useTranslation } from '@/i18n';
import { isMac } from '@/config/environment';
import { DictationState } from './hooks/useDictation';
import { AudioLevelBars } from './AudioLevelBars';

/** Below this, a press counts as a tap (toggle) rather than a hold. */
const HOLD_THRESHOLD_MS = 300;

interface Props {
  state: DictationState;
  /** Input loudness 0..1, drives the bars while recording. */
  level: number;
  /** Set when the OS or browser refused the microphone. */
  micDenied?: boolean;
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
}

/**
 * The microphone button, sitting inside the input box at its top right.
 *
 * Tap **or** hold — the user does not choose a mode. A quick press toggles
 * recording on and leaves it on; pressing and holding records only while held.
 * The two are told apart by how long the button was down, which means a user
 * who does not know the feature exists gets sensible behaviour either way.
 *
 * While recording the button grows a level meter to its left, inside the same
 * pill, so the microphone's state and what it is hearing read as one control.
 */
export function MicButton(props: Props) {
  const { state, level, micDenied, disabled, onStart, onStop } = props;
  const { t } = useTranslation('chat');

  const pressedAt = useRef(0);
  const startedByThisPress = useRef(false);

  const isRecording = state === DictationState.Listening || state === DictationState.Starting;

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || micDenied) return;
    // Capture so a pointer that slides off the button still delivers its
    // release; without it, a hold that drifts leaves the microphone open.
    event.currentTarget.setPointerCapture(event.pointerId);
    pressedAt.current = Date.now();

    if (isRecording) {
      // Already recording (from an earlier tap): this press stops it.
      startedByThisPress.current = false;
      return;
    }
    startedByThisPress.current = true;
    onStart();
  }

  function handlePointerUp() {
    if (disabled || micDenied) return;
    const heldFor = Date.now() - pressedAt.current;

    if (!startedByThisPress.current) {
      // The press began while already recording — it is the stop half of a tap.
      onStop();
      return;
    }
    // Started by this press: a hold ends on release, a tap leaves it running.
    if (heldFor >= HOLD_THRESHOLD_MS) onStop();
  }

  const shortcut = isMac() ? '⌘D' : 'Ctrl+D';
  // Failures are reported by the input banner, not here — a tooltip only shows
  // on hover, and something the user must act on should not need to be
  // discovered. The tooltip stays for what it is good at: naming the control.
  const tooltip = micDenied
    ? t('chatInput.dictation.micDenied')
    : isRecording
      ? t('chatInput.dictation.stop')
      : t('chatInput.dictation.tapOrHold');

  return (
    // z-20 must beat the editable layer's z-10. That layer covers the whole box
    // to catch clicks for the caret, so anything below it is visible but not
    // clickable — the button rendered fine and did nothing.
    //
    // end-2 rather than end-0: the input's own horizontal padding is 12px, so
    // pinning to the container edge would sit the button on the border.
    <div className="absolute top-[5px] end-2 z-20 group/mic">
      <button
        type="button"
        disabled={disabled || micDenied}
        aria-label={tooltip}
        aria-pressed={isRecording}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`flex items-center justify-center gap-1 h-[26px] rounded-[5px] border-none cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isRecording
            ? 'ps-2 bg-surface-overlay text-accent-primary'
            : 'bg-transparent text-text-tertiary hover:text-text-secondary'
        }`}
      >
        {isRecording && <AudioLevelBars level={level} />}
        <span
          className={`flex items-center justify-center w-[26px] h-[26px] rounded-[5px] shrink-0 transition-colors ${
            isRecording ? 'bg-accent-primary text-text-inverse' : ''
          }`}
        >
          <svg
            className="w-4 h-4 shrink-0"
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
        </span>
      </button>

      {/* Tooltip. Delayed on hover so it does not flash while the pointer
          crosses the button on its way somewhere else. */}
      <span
        aria-hidden="true"
        className="absolute top-full end-0 mt-1 px-2 py-1 rounded-md whitespace-nowrap text-xs pointer-events-none transition-opacity bg-surface-tooltip border border-border-default text-text-primary shadow-lg opacity-0 group-hover/mic:opacity-100 group-hover/mic:delay-[400ms]"
      >
        {tooltip}
        {!micDenied && !isRecording && (
          <span className="ms-1.5 px-1 py-px rounded bg-surface-overlay font-mono text-[0.9em]">
            {shortcut}
          </span>
        )}
      </span>
    </div>
  );
}
