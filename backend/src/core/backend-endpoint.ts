/**
 * Where this backend can be reached, once its server is listening. Other programs on the same
 * machine (the session-management MCP) read it from the CLI registry to find the backend that
 * holds a session, so a backend with no HTTP server running writes nothing.
 */
export interface BackendEndpoint {
  port: number;
  token: string;
}

let endpoint: BackendEndpoint | undefined;

export function setBackendEndpoint(next: BackendEndpoint | undefined): void {
  endpoint = next;
}

export function getBackendEndpoint(): BackendEndpoint | undefined {
  return endpoint;
}
