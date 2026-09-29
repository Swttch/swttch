import { ConnectionManager } from './connection-manager';

/**
 * Result of handling a GET /internal/status request. The caller writes
 * `status` and JSON-serialized `body` back to the HTTP response.
 */
export interface StatusRouteResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Runtime status snapshot for IDE-side consumers (the status-bar card in the
 * Kotlin plugin; the future IDE exit-confirm modal reuses the same counters).
 * Follows the plugin-queries-the-backend-over-HTTP precedent set by /version.
 *
 * Extracted from the HTTP layer so the payload shape is unit-testable without
 * spinning up a server.
 */
export function handleStatusRequest(connections: ConnectionManager): StatusRouteResult {
  return {
    status: 200,
    body: {
      keepAlive: connections.isKeepAlive(),
      connections: connections.getConnectionStats(),
      sessions: {
        total: connections.getSessionCount(),
        // Only sessions a client is attached to. A turn nobody can see is not
        // work in flight, and reporting it as such is what let a backend holding
        // a stranded CLI keep describing itself as healthy (issue #479).
        streaming: connections.getStreamingSessionCount(),
        // Sessions holding a live CLI with no client attached — the shape of that
        // same failure, named so it can be seen instead of inferred.
        orphaned: connections.getOrphanSessionCount(),
      },
    },
  };
}
