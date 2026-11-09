/**
 * Plays audio that arrives in pieces: 16-bit little-endian PCM, 16 kHz, mono, which is what the backend relays
 * from the speech service. Each piece is scheduled to start where the one before it ends, so what is heard is
 * one continuous voice even though it came in as many messages.
 *
 * Created inside the click that starts the reading: a browser only lets an AudioContext make sound when it
 * was made, or resumed, by the person.
 */
export const READ_ALOUD_SAMPLE_RATE = 16000;

/** A small lead so the first piece is not scheduled in the past while the next one is still on its way. */
const SCHEDULE_LEAD_SECONDS = 0.05;

export class PcmStreamPlayer {
  private context: AudioContext | null;
  private nextStart = 0;
  private readonly playing = new Set<AudioBufferSourceNode>();
  private inputEnded = false;
  private stopped = false;
  private ended: (() => void) | null = null;
  private started = false;

  constructor() {
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.context = Context ? new Context() : null;
  }

  /** False when this browser cannot play audio at all. */
  get supported(): boolean {
    return this.context !== null;
  }

  /** Called once, when the first piece starts to sound. */
  onStarted: (() => void) | null = null;

  /** Called once, when the last piece has been heard. */
  onEnded(callback: () => void): void {
    this.ended = callback;
  }

  /** Add a piece of audio to the end of what is playing. */
  push(pcm: Uint8Array): void {
    const context = this.context;
    if (!context || this.stopped || pcm.byteLength < 2) return;
    const samples = Math.floor(pcm.byteLength / 2);
    const view = new DataView(pcm.buffer, pcm.byteOffset, samples * 2);
    const buffer = context.createBuffer(1, samples, READ_ALOUD_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples; i++) channel[i] = view.getInt16(i * 2, true) / 32768;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const startAt = Math.max(this.nextStart, context.currentTime + SCHEDULE_LEAD_SECONDS);
    source.start(startAt);
    this.nextStart = startAt + buffer.duration;
    this.playing.add(source);
    source.onended = () => {
      this.playing.delete(source);
      this.settle();
    };
    if (!this.started) {
      this.started = true;
      this.onStarted?.();
    }
  }

  /** No more audio will come: the player ends when what it has has been heard. */
  finishInput(): void {
    this.inputEnded = true;
    this.settle();
  }

  pause(): void {
    void this.context?.suspend();
  }

  resume(): void {
    void this.context?.resume();
  }

  /** Stop at once and let go of the sound device. Nothing is called afterwards. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.ended = null;
    this.onStarted = null;
    for (const source of this.playing) {
      source.onended = null;
      try { source.stop(); } catch { /* it had not started */ }
    }
    this.playing.clear();
    void this.context?.close();
    this.context = null;
  }

  private settle(): void {
    if (this.stopped || !this.inputEnded || this.playing.size > 0) return;
    const ended = this.ended;
    this.ended = null;
    this.stop();
    ended?.();
  }
}
