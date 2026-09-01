/**
 * Await a CLI `control_response` from the backend.
 *
 * `sendControlRequestToProcess` writes a `control_request` to a live CLI's stdin
 * and the reply comes back as an ordinary stdout event, which the stream handler
 * broadcasts to the WebView. That is enough when the WebView is the one asking:
 * it matches the reply by `request_id` itself. It is not enough when the BACKEND
 * asks, because nothing on this side is listening for the answer.
 *
 * This module is that listener. A caller registers a `request_id` before writing
 * to stdin, the stream handler hands every `control_response` here on its way
 * past, and the matching registration resolves.
 *
 * The event is only READ here — `settleControlResponse` returns void and the
 * caller keeps forwarding the event unchanged, so the WebView still receives the
 * same bytes it always did (original-data preservation, CLAUDE.md).
 */

interface PendingRequest {
  resolve: (response: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const pending = new Map<string, PendingRequest>();

/** Prefix that marks a request_id as backend-issued, to keep it clear in logs. */
const BACKEND_REQUEST_PREFIX = 'backend';

let requestCounter = 0;

/**
 * Mint a request_id for a backend-issued control_request.
 *
 * Counter-based rather than time-based: two requests minted inside the same
 * millisecond would otherwise collide, and a collision here resolves the wrong
 * caller's promise with the wrong payload.
 */
export function nextControlRequestId(subtype: string): string {
  requestCounter += 1;
  return `${BACKEND_REQUEST_PREFIX}_${subtype}_${requestCounter}`;
}

/**
 * Wait for the `control_response` carrying `requestId`.
 *
 * Rejects on timeout, on an `error` subtype, and if the same id is registered
 * twice. Every caller is expected to treat a rejection as "ask the CLI the
 * official way instead" rather than as a failure to report, so the reasons are
 * kept in the message for the log rather than for the user.
 */
export function waitForControlResponse<T>(requestId: string, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (pending.has(requestId)) {
      reject(new Error(`control_request id already in flight: ${requestId}`));
      return;
    }
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`control_response timed out after ${timeoutMs}ms (${requestId})`));
    }, timeoutMs);
    // The backend must not be held open by a reply that never comes.
    timer.unref?.();
    pending.set(requestId, {
      resolve: (response) => resolve(response as T),
      reject,
      timer,
    });
  });
}

/**
 * Drop a registration whose request could not be written to stdin after all.
 *
 * Rejects rather than merely forgetting: a promise that is never settled keeps
 * its closure alive for the life of the backend and gives the caller nothing to
 * await. Callers that abandon the request must therefore swallow the rejection,
 * which is what makes the abandonment deliberate rather than an unhandled one.
 */
export function cancelControlResponse(requestId: string): void {
  const entry = pending.get(requestId);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(requestId);
  entry.reject(new Error(`control_request cancelled before it was sent (${requestId})`));
}

/**
 * Shape of the envelope the CLI replies with (measured against CLI 2.1.x):
 *
 *   {"type":"control_response",
 *    "response":{"subtype":"success","request_id":"...","response":{...}}}
 *
 * A failure arrives with `subtype: "error"` and an `error` string in place of
 * the payload. Both are read defensively — this is an undocumented envelope, so
 * anything that does not match is treated as "not ours" and left alone.
 */
interface ControlResponseEnvelope {
  response?: {
    subtype?: string;
    request_id?: string;
    response?: unknown;
    error?: string;
  };
}

/**
 * Hand a stream event to whichever backend caller is waiting for it.
 *
 * Safe to call for every event: anything that is not a `control_response`, or
 * whose id nobody registered (the WebView's own requests, for one), is ignored.
 */
export function settleControlResponse(event: Record<string, unknown>): void {
  if (event.type !== 'control_response') return;
  const inner = (event as ControlResponseEnvelope).response;
  const requestId = inner?.request_id;
  if (typeof requestId !== 'string') return;
  const entry = pending.get(requestId);
  if (!entry) return;

  clearTimeout(entry.timer);
  pending.delete(requestId);

  if (inner?.subtype === 'success') {
    entry.resolve(inner.response);
  } else {
    entry.reject(new Error(inner?.error ?? `control_request failed (${requestId})`));
  }
}

/** Test seam: drop every registration so one test cannot leak into the next. */
export function resetControlResponseWaiters(): void {
  for (const entry of pending.values()) clearTimeout(entry.timer);
  pending.clear();
  requestCounter = 0;
}
