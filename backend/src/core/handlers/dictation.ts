import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { loadSpeechToText, ExtendKitMissingError, type SpeechToTextStream } from '../extend-kit';

/**
 * Dictation — the backend half of voice input.
 *
 * The webview records the microphone (only a browser can) and the backend
 * holds the transcription socket (only it may touch credentials). Audio comes
 * in as base64 because the IPC envelope is JSON; transcripts go back out as
 * they arrive rather than in one lump at the end, so the text appears while
 * the user is still speaking.
 *
 * One stream per connection: a second tab dictating is a separate connection
 * with its own stream, and closing a tab must not silence another.
 */
const streams = new Map<string, SpeechToTextStream>();

/** Tear down a connection's stream without waiting on it. */
async function endStream(connectionId: string): Promise<void> {
  const stream = streams.get(connectionId);
  if (!stream) return;
  streams.delete(connectionId);
  try {
    await stream.close();
  } catch {
    // Closing is best-effort: the socket may already be gone, and failing here
    // would only mask whatever the caller was actually doing.
  }
}

/**
 * START_DICTATION — open a transcription stream for this connection.
 *
 * Any stream already open on the connection is closed first, so a user who
 * starts a new recording without a clean stop does not end up with two sockets
 * both writing into the same input.
 */
export async function startDictationHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = (message.payload ?? {}) as { language?: string; extraKeyterms?: string[] };

  await endStream(connectionId);

  try {
    const { openSpeechToTextStream } = await loadSpeechToText();
    const stream = await openSpeechToTextStream(
      {
        onTranscript: (text, isFinal) => {
          connections.sendTo(connectionId, MessageType.DICTATION_TRANSCRIPT, { text, isFinal });
        },
        onError: (errMessage, info) => {
          connections.sendTo(connectionId, MessageType.DICTATION_ERROR, {
            message: errMessage,
            fatal: info?.fatal ?? false,
          });
        },
      },
      { language: payload.language, extraKeyterms: payload.extraKeyterms },
    );

    streams.set(connectionId, stream);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
    });
  } catch (err) {
    // A missing kit is a setup problem the UI can offer to fix, not a failure
    // to report as noise — so it gets its own code rather than a message the
    // webview would have to pattern-match.
    const missing = err instanceof ExtendKitMissingError;
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      errorKind: missing ? 'kit_missing' : 'unknown',
      error: missing
        ? '@swttch/extend-kit is not installed'
        : err instanceof Error
          ? err.message
          : String(err),
    });
  }
}

/**
 * SEND_DICTATION_AUDIO — forward one chunk of recorded audio.
 *
 * Deliberately silent: audio arrives many times a second, and a chunk that
 * lands after the stream closed is normal (the webview cannot stop recording
 * the instant it asks us to stop). Acking or erroring on each one would add
 * traffic and log noise for something harmless.
 */
export async function sendDictationAudioHandler(
  connectionId: string,
  message: IPCMessage,
  _connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const stream = streams.get(connectionId);
  if (!stream) return;

  const { audio } = (message.payload ?? {}) as { audio?: string };
  if (!audio) return;

  try {
    stream.sendAudio(new Uint8Array(Buffer.from(audio, 'base64')));
  } catch {
    // A dead socket is reported through onError; dropping the chunk is right.
  }
}

/**
 * STOP_DICTATION — close the stream and let the service flush the last words.
 *
 * The ack waits for the close so the webview knows the trailing transcript has
 * had its chance to arrive before it decides the text is complete.
 */
export async function stopDictationHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  await endStream(connectionId);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
  });
}

/**
 * GET_DICTATION_AVAILABILITY — can this machine dictate at all?
 *
 * Two different "no" answers, because they need different UI: the kit is not
 * installed (offer to install it), or it is installed but Claude Code is not
 * logged in here (tell them to log in). Never throws — an unavailable feature
 * is an answer, not an error.
 */
export async function getDictationAvailabilityHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const { isSpeechToTextAvailable } = await loadSpeechToText();
    const loggedIn = await isSpeechToTextAvailable();
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      available: loggedIn,
      reason: loggedIn ? null : 'not_logged_in',
    });
  } catch {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      available: false,
      reason: 'kit_missing',
    });
  }
}

/** Release a connection's stream when its socket goes away. */
export function releaseDictation(connectionId: string): void {
  void endStream(connectionId);
}
