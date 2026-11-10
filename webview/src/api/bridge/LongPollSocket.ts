// webview/src/api/bridge/LongPollSocket.ts

/** Header the backend reads the per-launch token from on /lp/* requests. */
const TOKEN_HEADER = 'x-ccg-token';

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

/**
 * The control channel over plain HTTP long-polling, shaped like a browser
 * WebSocket so WebSocketConnector drives it unchanged.
 *
 * Used when the panel's browser can reach the backend over HTTP but cannot open
 * a WebSocket: on IntelliJ 2026.3 Remote Development the client-side JCEF
 * proxies every request to the host and fails every WebSocket before it leaves
 * the browser (#582). That proxy also buffers streamed responses, so this sticks
 * to plain request/response:
 *
 * - `POST /lp/open?<the /ws query>` → `{ sid }`
 * - `GET /lp/poll?sid=` → a JSON array of frames, held open by the backend until
 *   it has something (or answered empty after a while); polled back to back
 * - `POST /lp/send?sid=` → a JSON array of frames, one request in flight at a
 *   time so frames keep their order
 * - `POST /lp/close?sid=` on close
 *
 * Every request carries the token. A failure after open is reported the way a
 * dropped WebSocket reports it — `onclose` with code 1006 — so the connector's
 * existing reconnect path takes over.
 */
export class LongPollSocket {
  readyState: number = CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private sid: string | null = null;
  private outbox: string[] = [];
  private sending = false;
  private readonly pollAbort = new AbortController();

  /**
   * @param base   origin of the backend, e.g. `http://localhost:39291`
   * @param query  the same query the /ws URL would carry (`env=…&panelId=…`)
   * @param token  per-launch auth token
   */
  constructor(
    private readonly base: string,
    query: string,
    private readonly token: string,
  ) {
    void this.open(query);
  }

  send(data: string): void {
    if (this.readyState !== OPEN) throw new Error('LongPollSocket is not open');
    this.outbox.push(data);
    void this.flush();
  }

  close(): void {
    if (this.readyState === CLOSED) return;
    const sid = this.sid;
    this.finish(1000);
    if (sid) {
      fetch(`${this.base}/lp/close?sid=${encodeURIComponent(sid)}`, {
        method: 'POST',
        headers: this.headers(),
        keepalive: true,
      }).catch(() => {
        // The backend's heartbeat reaps a session nobody polls, so a lost close is harmless.
      });
    }
  }

  private async open(query: string): Promise<void> {
    try {
      const res = await fetch(`${this.base}/lp/open?${query}`, { method: 'POST', headers: this.headers() });
      if (!res.ok) throw new Error(`open answered ${res.status}`);
      const { sid } = (await res.json()) as { sid?: unknown };
      if (typeof sid !== 'string' || !sid) throw new Error('open returned no session id');
      if (this.readyState === CLOSED) return; // closed while opening
      this.sid = sid;
      this.readyState = OPEN;
      this.onopen?.(new Event('open'));
      void this.pollLoop();
    } catch {
      if (this.readyState === CLOSED) return;
      this.onerror?.(new Event('error'));
      this.finish(1006);
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.readyState === OPEN) {
      let frames: unknown;
      try {
        const res = await fetch(`${this.base}/lp/poll?sid=${encodeURIComponent(this.sid!)}`, {
          headers: this.headers(),
          cache: 'no-store',
          signal: this.pollAbort.signal,
        });
        if (!res.ok) throw new Error(`poll answered ${res.status}`);
        frames = await res.json();
      } catch {
        this.fail();
        return;
      }
      if (!Array.isArray(frames)) {
        this.fail();
        return;
      }
      for (const data of frames) {
        if (this.readyState !== OPEN) return;
        this.onmessage?.(new MessageEvent('message', { data }));
      }
    }
  }

  private async flush(): Promise<void> {
    if (this.sending || this.readyState !== OPEN || this.outbox.length === 0) return;
    this.sending = true;
    const batch = this.outbox;
    this.outbox = [];
    try {
      const res = await fetch(`${this.base}/lp/send?sid=${encodeURIComponent(this.sid!)}`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
      });
      if (!res.ok) throw new Error(`send answered ${res.status}`);
    } catch {
      this.sending = false;
      this.fail();
      return;
    }
    this.sending = false;
    void this.flush();
  }

  /** The channel broke after it opened: report it as a dropped WebSocket would. */
  private fail(): void {
    if (this.readyState === CLOSED) return;
    this.onerror?.(new Event('error'));
    this.finish(1006);
  }

  private finish(code: number): void {
    this.readyState = CLOSED;
    this.outbox = [];
    this.pollAbort.abort();
    this.onclose?.(new CloseEvent('close', { code, wasClean: code === 1000 }));
  }

  private headers(): Record<string, string> {
    return { [TOKEN_HEADER]: this.token };
  }
}
