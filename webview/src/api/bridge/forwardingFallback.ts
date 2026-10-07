/**
 * Why the port this page was loaded from is not a forwarded one (issue #473).
 *
 * Under JetBrains Remote Development the backend listens on the remote host while
 * the page runs on the user's own machine. The plugin asks the IDE to forward the
 * port, and when that does not happen the page still draws (the IDE relays its
 * HTTP) but never connects (it does not relay WebSocket), so the only thing on
 * screen is "Backend disconnected". Kotlin knows why the forward failed and says
 * so in the `forwarding` query param, which is read here so the connection banner
 * can name the reason.
 *
 * The values are the `wire` names of `ForwardFallback` in
 * `remotedev/ClientPortForwarder.kt`. A page loaded without the param (a local
 * IDE, a granted forward, a browser) has no fallback.
 */
export enum ForwardingFallback {
  /** A Remote Development host with no client attached yet; the panel is forwarded when one is. */
  NoClient = 'no-client',
  /** The client has Port Forwarding switched off. */
  Disabled = 'disabled',
  /** The client did not bind its end of the forward in time. */
  NotAssigned = 'not-assigned',
  /** The IDE's forwarding API is not one the plugin can call. */
  ApiUnavailable = 'api-unavailable',
  /** Anything else threw; the remote host's IDE log has the exception. */
  Failed = 'failed',
}

const PARAM = 'forwarding';

function parse(raw: string | null): ForwardingFallback | null {
  return Object.values(ForwardingFallback).find((reason) => reason === raw) ?? null;
}

/**
 * Read once, while the page is still on the URL the IDE opened. A later in-app
 * navigation may drop the query, and the reason has not changed by then.
 */
let resolved: ForwardingFallback | null | undefined;

export function readForwardingFallback(): ForwardingFallback | null {
  if (resolved !== undefined) return resolved;
  resolved =
    typeof window === 'undefined' || !window.location
      ? null
      : parse(new URLSearchParams(window.location.search).get(PARAM));
  return resolved;
}

// Read at import, not at first use. The banner may not render until the router has
// moved off the URL the IDE opened, and a navigation that drops the query would take
// the reason with it.
readForwardingFallback();

/** @internal test-only: forget the value read, as a new page load would. */
export function _resetForwardingFallback(): void {
  resolved = undefined;
}
