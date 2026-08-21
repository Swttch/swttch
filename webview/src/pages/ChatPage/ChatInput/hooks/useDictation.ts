import { useCallback, useEffect, useRef, useState } from 'react';
import i18n from '@/i18n/config';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import {
  SettingKey,
  VOICE_SILENCE_TIMEOUT_DEFAULT,
  clampVoiceSilenceTimeout,
} from '@/types/settings';
import { resolveDictationLanguage } from '@/i18n/dictationLanguage';
import { MessageType } from '@/shared';
import {
  startMicrophone,
  MicrophoneError,
  MicrophoneErrorKind,
  type MicrophoneCapture,
} from './microphone';
import {
  anchorAt,
  composeDictation,
  wasEditedExternally,
  type DictationAnchor,
} from './composeDictation';

/**
 * Loudness below which a block counts as silence.
 *
 * Speech RMS sits around 0.02–0.15 while a quiet room idles an order of
 * magnitude below that, so the threshold sits under the bottom of speech and
 * above room tone. Too high and it would cut off someone speaking softly.
 */
const SILENCE_LEVEL = 0.01;

/** What the composer needs to know to draw the button. */
export enum DictationState {
  /** Not recording. */
  Idle = 'idle',
  /** Microphone requested, or the transcription socket still opening. */
  Starting = 'starting',
  /** Recording and transcribing. */
  Listening = 'listening',
  /** Recording stopped; waiting for the last words to come back. */
  Finishing = 'finishing',
}

export interface DictationError {
  message: string;
  /** Retrying will not help — a denied microphone, or a rejected account. */
  fatal: boolean;
  /** The microphone specifically was refused; the button goes permanently dim. */
  micDenied?: boolean;
  /** The kit itself is missing, so the UI can offer to install it. */
  kitMissing?: boolean;
}

interface StartAck {
  status?: string;
  error?: string;
  errorKind?: string;
}

interface DictationTarget {
  /** Current composer text. */
  value: string;
  /** Caret offset to dictate at. */
  caret: number;
  /**
   * Write the composed text back, and put the caret at `caret`.
   *
   * Moving the caret is not cosmetic: the next recording anchors on wherever
   * the caret ends up, so a composer that ignores it dictates each phrase in
   * front of the last.
   */
  setValue: (value: string, caret?: number) => void;
}

/**
 * Voice input for the composer.
 *
 * The split is forced by where things are allowed to live: only the webview can
 * open a microphone, and only the backend may hold credentials, so audio is
 * recorded here and transcribed there.
 *
 * Text goes straight into the composer as it arrives — interim text included,
 * marked by {@link interimRange} so the input can paint it as provisional. That
 * is the arrangement the other Claude Code clients use, and it beats a separate
 * preview line: the user sees the sentence taking shape where it will actually
 * be sent, and a settled phrase needs no move.
 *
 * @param getTarget Reads the composer's current text and caret on demand.
 */
export function useDictation(getTarget: () => DictationTarget) {
  const { send, sendRaw, subscribe } = useBridgeContext();
  const { settings } = useSettings();
  const { settings: claudeSettings } = useClaudeSettings();
  const voice = settings[SettingKey.VOICE] ?? {};
  // The spoken language the user picked wins; Claude's own `language` answers
  // when they left it on "follow", which is what the CLI does.
  const spokenLanguage = resolveDictationLanguage({
    claudeLanguage: claudeSettings.language as string | undefined,
    speechLanguage: voice.speechLanguage,
    uiLocale: i18n.language,
  });

  // Clamped rather than trusted: a stored value could predate the current
  // bounds, or have been edited into the settings file by hand.
  const silenceTimeoutMs =
    clampVoiceSilenceTimeout(voice.silenceTimeout ?? VOICE_SILENCE_TIMEOUT_DEFAULT) * 1000;
  const [state, setState] = useState<DictationState>(DictationState.Idle);
  const [interimRange, setInterimRange] = useState<{ start: number; end: number } | null>(null);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<DictationError | null>(null);

  const captureRef = useRef<MicrophoneCapture | null>(null);
  const anchorRef = useRef<DictationAnchor | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const getTargetRef = useRef(getTarget);
  getTargetRef.current = getTarget;

  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // stop() is defined below but the silence timer is armed from inside the
  // microphone callback, which is created before it. The ref breaks the cycle.
  const stopRef = useRef<() => void>(() => {});

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  /** Restart the countdown to the automatic stop. */
  const armSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null;
      stopRef.current();
    }, silenceTimeoutMs);
  }, [clearSilenceTimer, silenceTimeoutMs]);

  const releaseMicrophone = useCallback(() => {
    clearSilenceTimer();
    captureRef.current?.stop();
    captureRef.current = null;
    setLevel(0);
  }, [clearSilenceTimer]);

  const finish = useCallback(() => {
    releaseMicrophone();
    anchorRef.current = null;
    setInterimRange(null);
    setState(DictationState.Idle);
  }, [releaseMicrophone]);

  useEffect(() => {
    const offTranscript = subscribe(MessageType.DICTATION_TRANSCRIPT, (message) => {
      // subscribe hands over the whole envelope, not the payload — reading
      // `text` off the envelope silently yielded undefined and dropped every
      // transcript.
      const { text, isFinal } = (message.payload ?? {}) as { text?: string; isFinal?: boolean };
      const anchor = anchorRef.current;
      if (!text || !anchor) return;

      const target = getTargetRef.current();
      // The user typed while we were writing. Their edit wins — carrying on
      // would overwrite it on the next transcript.
      if (wasEditedExternally(anchor, target.value)) {
        void send(MessageType.STOP_DICTATION, {});
        finish();
        return;
      }

      const composed = composeDictation(anchor, text, isFinal ?? false);
      if (!composed) return;

      anchor.lastSetValue = composed.value;
      // Hand over where the dictated run ends, not just the text: the composer
      // has to put the caret there. Its editable layer resets the caret to the
      // start when the content is replaced, and the NEXT recording anchors on
      // whatever the caret then reports — so leaving it at 0 made consecutive
      // phrases stack up backwards.
      target.setValue(composed.value, composed.caret);
      setInterimRange(composed.interim);

      // A settled phrase moves the anchor forward, so the next phrase is
      // dictated after it instead of replacing it.
      if (isFinal) {
        anchorRef.current = anchorAt(composed.value, composed.caret);
      }
    });

    const offError = subscribe(MessageType.DICTATION_ERROR, (envelope) => {
      const { message, fatal } = (envelope.payload ?? {}) as {
        message?: string;
        fatal?: boolean;
      };
      setError({ message: message ?? 'Dictation failed', fatal: fatal ?? false });
      // A failed stream produces no more text, so stop holding the microphone —
      // a lit recording indicator after an error reads as still listening.
      finish();
    });

    return () => {
      offTranscript();
      offError();
    };
  }, [subscribe, send, finish]);

  /** Release the microphone if the composer unmounts mid-recording. */
  useEffect(() => releaseMicrophone, [releaseMicrophone]);

  const start = useCallback(async () => {
    if (stateRef.current !== DictationState.Idle) return;
    setError(null);
    setState(DictationState.Starting);

    const target = getTargetRef.current();
    anchorRef.current = anchorAt(target.value, target.caret);

    try {
      // Without a language the service assumes English and transcribes other
      // languages phonetically through it — "안녕하세요" came back as
      // "ah ñomaseu".
      const ack = (await send(MessageType.START_DICTATION, {
        language: spokenLanguage,
      })) as StartAck;
      if (ack?.status !== 'ok') {
        setError({
          message: ack?.error ?? 'Could not start dictation',
          fatal: true,
          kitMissing: ack?.errorKind === 'kit_missing',
        });
        finish();
        return;
      }

      captureRef.current = await startMicrophone({
        onAudio: (chunk) => {
          // sendRaw, not send: audio goes out ~12 times a second and the
          // backend deliberately does not ack it. Through the request path each
          // chunk would sit in the pending map waiting 30s for a reply that
          // never comes, and the transcript would never arrive.
          //
          // Base64 because the IPC envelope is JSON.
          let binary = '';
          for (let i = 0; i < chunk.length; i++) binary += String.fromCharCode(chunk[i]);
          sendRaw(MessageType.SEND_DICTATION_AUDIO, { audio: btoa(binary) });
        },
        onLevel: (value) => {
          setLevel(value);
          // Every audible block pushes the deadline back, so the timeout
          // measures silence rather than total recording length — dictating for
          // ten minutes straight is fine, pausing for thirty seconds is not.
          if (value >= SILENCE_LEVEL) armSilenceTimer();
        },
      });

      // Arm it once up front too: a microphone that never hears anything —
      // muted, or the wrong device — would otherwise record forever, which is
      // exactly the case the timeout exists for.
      armSilenceTimer();

      setState(DictationState.Listening);
    } catch (err) {
      // The microphone failed after the stream opened — close it so we do not
      // leave a socket running with nothing to transcribe.
      void send(MessageType.STOP_DICTATION, {});
      const kind = err instanceof MicrophoneError ? err.kind : MicrophoneErrorKind.Unknown;
      setError({
        message:
          kind === MicrophoneErrorKind.Denied
            ? 'micDenied'
            : kind === MicrophoneErrorKind.NoDevice
              ? 'noMic'
              : err instanceof Error
                ? err.message
                : 'Could not access the microphone',
        fatal: true,
        micDenied: kind === MicrophoneErrorKind.Denied,
      });
      finish();
    }
  }, [send, sendRaw, finish, armSilenceTimer, spokenLanguage]);

  const stop = useCallback(async () => {
    if (stateRef.current === DictationState.Idle) return;
    // Stop capturing first: anything recorded past this point is the user
    // having already stopped speaking.
    releaseMicrophone();
    setState(DictationState.Finishing);
    try {
      await send(MessageType.STOP_DICTATION, {});
    } finally {
      finish();
    }
  }, [send, releaseMicrophone, finish]);

  // The silence timer fires a stop that was not yet defined when it was armed.
  stopRef.current = () => void stop();

  const toggle = useCallback(() => {
    if (stateRef.current === DictationState.Idle) void start();
    else void stop();
  }, [start, stop]);

  return {
    state,
    isRecording: state === DictationState.Listening || state === DictationState.Starting,
    interimRange,
    level,
    error,
    start,
    stop,
    toggle,
    dismissError: useCallback(() => setError(null), []),
  };
}
