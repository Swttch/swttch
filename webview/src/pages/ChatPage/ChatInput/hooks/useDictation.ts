import { useCallback, useEffect, useRef, useState } from 'react';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { MessageType } from '@/shared';
import {
  startMicrophone,
  MicrophoneError,
  MicrophoneErrorKind,
  type MicrophoneCapture,
} from './microphone';

/** What the composer needs to know to draw the button and the text. */
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
  /** Set when the kit itself is missing, so the UI can offer to install it. */
  kitMissing?: boolean;
}

interface StartAck {
  status?: string;
  error?: string;
  errorKind?: string;
}

/**
 * Voice input for the composer.
 *
 * The split is forced by where things are allowed to live: only the webview can
 * open a microphone, and only the backend may hold credentials, so audio is
 * recorded here and transcribed there. This hook owns that round trip and hands
 * the composer back plain text.
 *
 * Text arrives in two kinds. Interim text is a live guess that will be replaced,
 * so it is exposed separately for the caller to render as a preview; final text
 * is settled and is appended to the committed transcript. Keeping them apart is
 * what stops the input from flickering as the recognizer changes its mind.
 *
 * @param onFinalText Called with each settled phrase, ready to insert.
 */
export function useDictation(onFinalText: (text: string) => void) {
  const { send, subscribe } = useBridgeContext();
  const [state, setState] = useState<DictationState>(DictationState.Idle);
  const [interimText, setInterimText] = useState('');
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<DictationError | null>(null);

  const captureRef = useRef<MicrophoneCapture | null>(null);
  // Read inside subscription callbacks, which close over their first render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const onFinalTextRef = useRef(onFinalText);
  onFinalTextRef.current = onFinalText;

  const releaseMicrophone = useCallback(() => {
    captureRef.current?.stop();
    captureRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => {
    const offTranscript = subscribe(MessageType.DICTATION_TRANSCRIPT, (payload) => {
      const { text, isFinal } = (payload ?? {}) as { text?: string; isFinal?: boolean };
      if (!text) return;
      if (isFinal) {
        setInterimText('');
        onFinalTextRef.current(text);
      } else {
        setInterimText(text);
      }
    });

    const offError = subscribe(MessageType.DICTATION_ERROR, (payload) => {
      const { message, fatal } = (payload ?? {}) as { message?: string; fatal?: boolean };
      setError({ message: message ?? 'Dictation failed', fatal: fatal ?? false });
      // A stream that has failed will not produce more text, so hold onto the
      // microphone no longer — the recording indicator staying lit after an
      // error reads as if we are still listening.
      releaseMicrophone();
      setState(DictationState.Idle);
      setInterimText('');
    });

    return () => {
      offTranscript();
      offError();
    };
  }, [subscribe, releaseMicrophone]);

  /** Release the microphone if the composer unmounts mid-recording. */
  useEffect(() => releaseMicrophone, [releaseMicrophone]);

  const start = useCallback(async () => {
    if (stateRef.current !== DictationState.Idle) return;
    setError(null);
    setInterimText('');
    setState(DictationState.Starting);

    try {
      const ack = (await send(MessageType.START_DICTATION, {})) as StartAck;
      if (ack?.status !== 'ok') {
        setError({
          message: ack?.error ?? 'Could not start dictation',
          fatal: true,
          kitMissing: ack?.errorKind === 'kit_missing',
        });
        setState(DictationState.Idle);
        return;
      }

      captureRef.current = await startMicrophone({
        onAudio: (chunk) => {
          // Base64 because the IPC envelope is JSON. Chunks are ~85 ms, so the
          // encoding cost is negligible next to the network round trip.
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
      const denied = err instanceof MicrophoneError && err.kind === MicrophoneErrorKind.Denied;
      const noDevice = err instanceof MicrophoneError && err.kind === MicrophoneErrorKind.NoDevice;
      setError({
        message: denied
          ? 'Microphone access is denied in system settings'
          : noDevice
            ? 'No microphone was found'
            : err instanceof Error
              ? err.message
              : 'Could not access the microphone',
        fatal: true,
      });
      setState(DictationState.Idle);
    }
  }, [send]);

  const stop = useCallback(async () => {
    if (stateRef.current === DictationState.Idle) return;
    // Stop capturing first: anything recorded past this point is the user
    // already having stopped speaking.
    releaseMicrophone();
    setState(DictationState.Finishing);
    try {
      await send(MessageType.STOP_DICTATION, {});
    } finally {
      setState(DictationState.Idle);
      setInterimText('');
    }
  }, [send, releaseMicrophone]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    state,
    isRecording: state === DictationState.Listening || state === DictationState.Starting,
    interimText,
    level,
    error,
    start,
    stop,
    dismissError,
  };
}
