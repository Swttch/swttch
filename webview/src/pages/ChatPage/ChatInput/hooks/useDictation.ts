import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
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
  /** Write the composed text back. */
  setValue: (value: string) => void;
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
  const { send, subscribe } = useBridgeContext();
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

  const releaseMicrophone = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    setLevel(0);
  }, []);

  const finish = useCallback(() => {
    releaseMicrophone();
    anchorRef.current = null;
    setInterimRange(null);
    setState(DictationState.Idle);
  }, [releaseMicrophone]);

  useEffect(() => {
    const offTranscript = subscribe(MessageType.DICTATION_TRANSCRIPT, (payload) => {
      const { text, isFinal } = (payload ?? {}) as { text?: string; isFinal?: boolean };
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
      target.setValue(composed.value);
      setInterimRange(composed.interim);

      // A settled phrase moves the anchor forward, so the next phrase is
      // dictated after it instead of replacing it.
      if (isFinal) {
        anchorRef.current = anchorAt(composed.value, composed.caret);
      }
    });

    const offError = subscribe(MessageType.DICTATION_ERROR, (payload) => {
      const { message, fatal } = (payload ?? {}) as { message?: string; fatal?: boolean };
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
      const ack = (await send(MessageType.START_DICTATION, {})) as StartAck;
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
          // Base64 because the IPC envelope is JSON. Chunks are ~85 ms, so the
          // encoding cost is negligible next to the round trip.
          let binary = '';
          for (let i = 0; i < chunk.length; i++) binary += String.fromCharCode(chunk[i]);
          void send(MessageType.SEND_DICTATION_AUDIO, { audio: btoa(binary) });
        },
        onLevel: setLevel,
      });

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
  }, [send, finish]);

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
