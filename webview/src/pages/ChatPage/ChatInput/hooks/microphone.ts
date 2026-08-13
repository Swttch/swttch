/**
 * Microphone capture, in the one format the transcription service accepts.
 *
 * MediaRecorder is the obvious API and the wrong one here: it hands back
 * encoded webm/opus, while the service wants raw 16-bit PCM at 16 kHz mono and
 * answers anything else with silence rather than an error. So we tap the audio
 * graph directly and do the conversion ourselves.
 */

/** The service's format. Sending anything else transcribes to nothing. */
const TARGET_SAMPLE_RATE = 16000;

/**
 * Frames per analysis block. 4096 at the browser's rate is roughly 85 ms — long
 * enough that we are not posting messages constantly, short enough that speech
 * still arrives while the user is talking rather than after.
 */
const FRAME_SIZE = 4096;

export interface MicrophoneCapture {
  /** Stop capturing and release the microphone. Safe to call twice. */
  stop: () => void;
}

export interface MicrophoneHandlers {
  /** One chunk of 16-bit PCM at 16 kHz, mono, ready to send as-is. */
  onAudio: (chunk: Uint8Array) => void;
  /**
   * Current input loudness, 0..1, for a level meter. Emitted per chunk so the
   * UI can show that the microphone is actually hearing something — the
   * difference between "recording" and "recording silence" is otherwise
   * invisible until the transcript fails to appear.
   */
  onLevel?: (level: number) => void;
}

/** Why we could not start, in terms the UI can act on. */
export enum MicrophoneErrorKind {
  /** The user (or the OS) denied microphone access. */
  Denied = 'denied',
  /** No input device present. */
  NoDevice = 'no_device',
  /** getUserMedia is missing — an insecure origin, or a stripped webview. */
  Unsupported = 'unsupported',
  /** Anything else. */
  Unknown = 'unknown',
}

export class MicrophoneError extends Error {
  constructor(
    readonly kind: MicrophoneErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'MicrophoneError';
  }
}

/**
 * Downsample float samples to 16 kHz and convert to little-endian 16-bit PCM.
 *
 * Averaging across each source window rather than picking one sample matters:
 * plain decimation aliases high frequencies down into the speech band, which
 * the recognizer hears as a hiss over every word.
 */
export function toPcm16(input: Float32Array, inputRate: number): Uint8Array {
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const outLength = Math.floor(input.length / ratio);
  const out = new Uint8Array(outLength * 2);
  const view = new DataView(out.buffer);

  for (let i = 0; i < outLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);

    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    const sample = end > start ? sum / (end - start) : 0;

    // Clamp before scaling: a sample slightly outside [-1, 1] would otherwise
    // wrap around to the opposite extreme and click.
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  return out;
}

/** Root-mean-square loudness of a block, 0..1. */
export function rmsLevel(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** Map a getUserMedia rejection onto something the UI can explain. */
function classify(err: unknown): MicrophoneError {
  const name = err instanceof Error ? err.name : '';
  const message = err instanceof Error ? err.message : String(err);

  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new MicrophoneError(MicrophoneErrorKind.Denied, message);
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new MicrophoneError(MicrophoneErrorKind.NoDevice, message);
  }
  return new MicrophoneError(MicrophoneErrorKind.Unknown, message);
}

/**
 * Start capturing. Resolves once audio is flowing; rejects with a
 * {@link MicrophoneError} if the microphone cannot be opened.
 */
export async function startMicrophone(handlers: MicrophoneHandlers): Promise<MicrophoneCapture> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneError(
      MicrophoneErrorKind.Unsupported,
      'Microphone capture is not available in this environment',
    );
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        // Browser-side cleanup earns its keep here: dictation is usually a
        // laptop mic in a room, and the recognizer does better without the
        // room in the signal.
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  } catch (err) {
    throw classify(err);
  }

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated in favour of AudioWorklet, but a worklet needs
  // a separately served module file. Inside the IDE's webview the page is served
  // from a bundle with no reliable URL to hand it, so the deprecated node is the
  // one that actually works in both of our environments.
  const processor = context.createScriptProcessor(FRAME_SIZE, 1, 1);

  let stopped = false;

  processor.onaudioprocess = (event) => {
    if (stopped) return;
    const samples = event.inputBuffer.getChannelData(0);
    handlers.onLevel?.(rmsLevel(samples));
    handlers.onAudio(toPcm16(samples, context.sampleRate));
  };

  source.connect(processor);
  // A ScriptProcessor only runs while connected to a destination. We do not want
  // to hear ourselves, so it feeds a muted gain node instead of the speakers.
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(context.destination);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      processor.onaudioprocess = null;
      processor.disconnect();
      mute.disconnect();
      source.disconnect();
      // Stopping the tracks is what turns off the browser's recording indicator;
      // closing the context alone leaves it lit, which reads as "still listening".
      for (const track of stream.getTracks()) track.stop();
      void context.close();
    },
  };
}
