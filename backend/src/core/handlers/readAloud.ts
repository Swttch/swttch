import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType, DictationErrorKind } from '../../shared';
import {
  spawnTextToSpeech,
  getExtCapabilities,
  getAccountVoiceSettings,
  ExtendKitMissingError,
  ExtendKitTooOldError,
  ExtendKitProbeFailedError,
  EXTEND_KIT_PACKAGE,
  type TextToSpeechStream,
} from '../extend-kit';

/**
 * Read aloud — the backend half of the "Read aloud" button on a reply.
 *
 * The backend runs `swttch-ext tts`, which reads the machine's Claude Code login on its own side of the process
 * boundary and streams the voice back as raw audio; this handler only ever sees text going out and audio coming
 * in. Audio goes to the webview in base64 because the IPC envelope is JSON, as dictation's does the other way.
 *
 * One reading per connection: starting a second one replaces the first, and a closed tab must not leave a
 * reading running.
 */
const readings = new Map<string, TextToSpeechStream>();

/** Hand back whichever kit failure this is, in the codes dictation uses for the same three situations. */
function classifyKitFailure(err: unknown): { errorKind: DictationErrorKind; error: string } | null {
  if (err instanceof ExtendKitMissingError) {
    return { errorKind: DictationErrorKind.KIT_MISSING, error: `${EXTEND_KIT_PACKAGE} is not installed` };
  }
  if (err instanceof ExtendKitTooOldError) return { errorKind: DictationErrorKind.KIT_TOO_OLD, error: err.message };
  if (err instanceof ExtendKitProbeFailedError) return { errorKind: DictationErrorKind.KIT_UNUSABLE, error: err.message };
  return null;
}

function endReading(connectionId: string): void {
  const reading = readings.get(connectionId);
  if (!reading) return;
  readings.delete(connectionId);
  reading.cancel();
}

/**
 * START_READ_ALOUD — open a reading for this connection.
 *
 * The ack comes as soon as the child is running, not when the reading ends: audio follows as READ_ALOUD_AUDIO
 * messages, and the end is READ_ALOUD_DONE or READ_ALOUD_ERROR.
 */
export async function startReadAloudHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const payload = (message.payload ?? {}) as { text?: string; language?: string; voice?: string; speed?: number; workingDir?: string };
  endReading(connectionId);

  if (typeof payload.text !== 'string' || payload.text.trim() === '') {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      errorKind: DictationErrorKind.UNKNOWN,
      error: 'There is nothing to read aloud',
    });
    return;
  }

  try {
    const stream = await spawnTextToSpeech(
      payload.text,
      {
        onAudio: (pcm) => {
          connections.sendTo(connectionId, MessageType.READ_ALOUD_AUDIO, { audio: pcm.toString('base64') });
        },
        onDone: () => {
          readings.delete(connectionId);
          connections.sendTo(connectionId, MessageType.READ_ALOUD_DONE, {});
        },
        onError: (errMessage, info) => {
          readings.delete(connectionId);
          connections.sendTo(connectionId, MessageType.READ_ALOUD_ERROR, { message: errMessage, fatal: info?.fatal ?? false });
        },
      },
      { language: payload.language, voice: payload.voice, speed: payload.speed },
      payload.workingDir,
    );
    readings.set(connectionId, stream);
    connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
  } catch (err) {
    const kit = classifyKitFailure(err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      errorKind: kit?.errorKind ?? DictationErrorKind.UNKNOWN,
      error: kit?.error ?? (err instanceof Error ? err.message : String(err)),
    });
  }
}

/** STOP_READ_ALOUD — stop the reading of this connection, if there is one. */
export async function stopReadAloudHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  endReading(connectionId);
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, status: 'ok' });
}

/**
 * GET_READ_ALOUD_AVAILABILITY — can this machine read aloud?
 *
 * "Yes" needs the kit with the `tts` command. Whether the Claude Code login is good is found out when the
 * reading starts, and said then: a login problem is not a setup problem the button can be hidden for.
 * Never throws: an unavailable feature is an answer.
 */
export async function getReadAloudAvailabilityHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { workingDir } = (message.payload ?? {}) as { workingDir?: string };
  try {
    const caps = await getExtCapabilities(workingDir);
    if (!caps.installed) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId, status: 'ok', available: false, reason: DictationErrorKind.KIT_MISSING, detail: null,
      });
      return;
    }
    if (!caps.capabilities.includes('tts')) {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId, status: 'ok', available: false, reason: DictationErrorKind.KIT_TOO_OLD, detail: null,
      });
      return;
    }
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId, status: 'ok', available: true, reason: null, detail: null,
    });
  } catch (err) {
    const kit = classifyKitFailure(err);
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      available: false,
      reason: kit?.errorKind ?? DictationErrorKind.UNKNOWN,
      detail: kit?.error ?? (err instanceof Error ? err.message : String(err)),
    });
  }
}

/** The connection closed: its reading must not go on. */
export function releaseReadAloud(connectionId: string): void {
  endReading(connectionId);
}

/**
 * GET_READ_ALOUD_VOICE_SETTINGS — what the Claude account has chosen for reading aloud.
 *
 * The settings screen shows these as the starting values of its rows, so a person sees the voice, speed and
 * language that reading aloud will use instead of a word that says "whatever the account says". All three are
 * null when they cannot be known; the screen then shows its own defaults.
 */
export async function getReadAloudVoiceSettingsHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const { workingDir } = (message.payload ?? {}) as { workingDir?: string };
  const settings = await getAccountVoiceSettings(workingDir);
  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    known: settings !== null,
    voice: settings?.voice ?? null,
    speed: settings?.speed ?? null,
    language: settings?.language ?? null,
  });
}
