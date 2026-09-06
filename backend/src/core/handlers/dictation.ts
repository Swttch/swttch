import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, DictationErrorKind } from '../../shared';
import {
  loadSpeechToText,
  getExtendKitVersion,
  resetExtendKitCache,
  ExtendKitMissingError,
  EXTEND_KIT_PACKAGE,
  type SpeechToTextStream,
} from '../extend-kit';
import { fetchDistTags } from './getCliUpdateInfo';
import { isNewerVersion } from '../cli-update';

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

/**
 * Whether this machine can authorize a dictation stream.
 *
 * The stream is opened with the OAuth token a Claude account login leaves
 * behind, and every official Claude Code client declines rather than reaching
 * for an API key instead. See {@link DictationErrorKind.NOT_LOGGED_IN} for the
 * evidence, and for what about that is measured and what is not.
 *
 * Wrapped rather than called directly because the kit's own probe does not
 * answer false for every "no": it returns false only for the failures its error
 * type covers, and a credential store that exists but holds no Claude account
 * login throws straight out of the property read instead. Both are the same
 * answer here. Any other failure to read credentials lands here too, and being
 * told to sign in is still the right next step when we cannot see a login.
 */
async function isDictationAuthorized(probe: () => Promise<boolean>): Promise<boolean> {
  try {
    return await probe();
  } catch {
    return false;
  }
}

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
 *
 * Authorization is checked before anything is opened. Left to fail on its own
 * the kit dies inside its credential read, and the message that reaches the
 * banner is the exception text ("Cannot read properties of undefined (reading
 * 'accessToken')") rather than anything the user can act on (#355).
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
    const { openSpeechToTextStream, isSpeechToTextAvailable } = await loadSpeechToText();

    if (!(await isDictationAuthorized(isSpeechToTextAvailable))) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        errorKind: DictationErrorKind.NOT_LOGGED_IN,
        error: 'No Claude account login is available for dictation',
      });
      return;
    }

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
    // to report as noise, so it gets its own code rather than a message the
    // webview would have to pattern-match.
    const missing = err instanceof ExtendKitMissingError;
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      errorKind: missing ? DictationErrorKind.KIT_MISSING : DictationErrorKind.UNKNOWN,
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
 * installed (offer to install it), or it is installed but this machine has no
 * Claude account login (tell them to sign in). Never throws, since an
 * unavailable feature is an answer rather than an error.
 *
 * Only a missing kit may be reported as a missing kit. Catching everything and
 * calling all of it `kit_missing` is what this handler used to do, which named
 * the wrong problem for the case that actually happens: an installed kit with no
 * login behind it (#355).
 */
export async function getDictationAvailabilityHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  let probe: () => Promise<boolean>;
  try {
    ({ isSpeechToTextAvailable: probe } = await loadSpeechToText());
  } catch {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      available: false,
      reason: DictationErrorKind.KIT_MISSING,
    });
    return;
  }

  const authorized = await isDictationAuthorized(probe);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    available: authorized,
    reason: authorized ? null : DictationErrorKind.NOT_LOGGED_IN,
  });
}

/**
 * GET_EXTEND_KIT_INFO — what is installed, and what npm has.
 *
 * Feeds the version shown beside the voice settings and the update button next
 * to it, mirroring how the CLI's own version and update control work.
 *
 * `latest` is null when the registry cannot be reached, which is not an error:
 * an offline machine should still show the installed version rather than an
 * empty section, so the caller simply omits the update affordance.
 *
 * `payload.refresh` drops the loader's cached resolution before answering.
 * That cache exists because resolving where the kit lives spawns package
 * managers, which is far too slow to repeat on every render — but it also means
 * the answer is frozen at whatever was true when it was first computed. The
 * version is clickable precisely to re-check after the kit changed OUTSIDE this
 * app (installed, updated or removed in a terminal), so honouring the cache
 * there would make the control do nothing at the one moment it is pressed.
 */
export async function getExtendKitInfoHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  if ((message.payload as { refresh?: boolean } | undefined)?.refresh) {
    resetExtendKitCache();
  }

  const [installed, tags] = await Promise.all([
    getExtendKitVersion(),
    fetchDistTags(EXTEND_KIT_PACKAGE),
  ]);

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    packageName: EXTEND_KIT_PACKAGE,
    installed,
    latest: tags.latest,
    updatable: Boolean(installed && tags.latest && isNewerVersion(tags.latest, installed)),
  });
}

/** Release a connection's stream when its socket goes away. */
export function releaseDictation(connectionId: string): void {
  void endStream(connectionId);
}
