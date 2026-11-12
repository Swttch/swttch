// backend/src/ws/long-poll-transport.ts

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import type { ServerResponse } from 'http';

/**
 * Long-poll fallback for the /ws control channel.
 *
 * Why it exists: on IntelliJ 2026.3 Remote Development the panel's JCEF runs on
 * the client, and the platform proxies every HTTP request it makes to the host
 * — but every WebSocket fails inside the browser before reaching any network
 * (#582). Streamed responses are buffered by that proxy too, so the one thing
 * such a panel can do is ordinary request/response. This transport carries the
 * control channel over exactly that.
 *
 * How it plugs in: a [LongPollSocket] is shaped like the `ws` WebSocket the
 * /ws handler already works with (readyState, send, close, ping, terminate and
 * the `message` / `close` / `pong` events), so ws-server hands it to the SAME
 * connection handler. Sessions, panel routing, heartbeat and teardown therefore
 * have one implementation for both transports. HTTP parsing and the token /
 * Origin gates stay in ws-server, next to the WebSocket ones.
 */

/** How long a poll is parked before it is answered empty so the client re-polls. */
export const LONG_POLL_HOLD_MS = 25_000;

const OPEN = 1;
const CLOSED = 3;

export class LongPollSocket extends EventEmitter {
  readyState = OPEN;
  private queue: string[] = [];
  private parked: { res: ServerResponse; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(private readonly holdMs: number) {
    super();
  }

  /** Queue an outbound frame; a parked poll is answered at once. */
  send(data: string): void {
    if (this.readyState !== OPEN) return;
    this.queue.push(data);
    if (this.parked) this.answerParked();
  }

  /**
   * Liveness for this transport is the client polling, which [attachPoll]
   * reports as `pong`. There is no frame to send, so a heartbeat ping is a no-op.
   */
  ping(): void {}

  close(): void {
    this.shutdown();
  }

  terminate(): void {
    this.shutdown();
  }

  /**
   * Serve one poll: answer with whatever is queued, or park it until something
   * is sent or [holdMs] passes. A newer poll replaces a parked one (answered
   * empty), so a client never has two outstanding.
   */
  attachPoll(res: ServerResponse): void {
    if (this.readyState !== OPEN) {
      respond(res, 410, []);
      return;
    }
    this.emit('pong');
    if (this.parked) {
      const previous = this.parked;
      this.parked = null;
      clearTimeout(previous.timer);
      respond(previous.res, 200, []);
    }
    if (this.queue.length > 0) {
      respond(res, 200, this.takeQueue());
      return;
    }
    const timer = setTimeout(() => this.answerParked(), this.holdMs);
    this.parked = { res, timer };
    res.on('close', () => {
      if (this.parked?.res === res) {
        clearTimeout(this.parked.timer);
        this.parked = null;
      }
    });
  }

  /**
   * Deliver inbound frames the way a WebSocket would: one `message` each, in order.
   *
   * Each frame is handed over as the string it already is. A WebSocket delivers a Buffer, but
   * the only thing the /ws handler does with it is `data.toString()`, which returns a string
   * unchanged. Wrapping the frame in a Buffer here would copy it (a frame can be tens of
   * megabytes: a pasted image) only for the handler to copy it back. The handler's parameter is
   * typed `Buffer | string` for this reason.
   */
  receive(frames: string[]): void {
    if (this.readyState !== OPEN) return;
    for (const frame of frames) this.emit('message', frame);
  }

  private answerParked(): void {
    if (!this.parked) return;
    const { res, timer } = this.parked;
    this.parked = null;
    clearTimeout(timer);
    respond(res, 200, this.takeQueue());
  }

  private takeQueue(): string[] {
    const frames = this.queue;
    this.queue = [];
    return frames;
  }

  private shutdown(): void {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.queue = [];
    if (this.parked) {
      const { res, timer } = this.parked;
      this.parked = null;
      clearTimeout(timer);
      respond(res, 410, []);
    }
    this.emit('close');
  }
}

/** Live long-poll sessions by their unguessable id. */
export class LongPollRegistry {
  private readonly sessions = new Map<string, LongPollSocket>();

  constructor(private readonly holdMs: number = LONG_POLL_HOLD_MS) {}

  /** Create a session; the caller hands the socket to the /ws connection handler. */
  open(): { sid: string; socket: LongPollSocket } {
    const sid = randomBytes(24).toString('base64url');
    const socket = new LongPollSocket(this.holdMs);
    this.sessions.set(sid, socket);
    socket.once('close', () => this.sessions.delete(sid));
    return { sid, socket };
  }

  /** The live session for [sid], or undefined when it never existed or has closed. */
  get(sid: string | null): LongPollSocket | undefined {
    return sid ? this.sessions.get(sid) : undefined;
  }

  closeAll(): void {
    for (const socket of [...this.sessions.values()]) socket.close();
  }
}

function respond(res: ServerResponse, status: number, frames: string[]): void {
  if (res.writableEnded || res.destroyed) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(frames));
}
