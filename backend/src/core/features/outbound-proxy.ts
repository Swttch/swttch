/**
 * The proxy this backend's own outbound requests go through.
 *
 * The backend makes five kinds of request of its own: the announcements feed, the sponsor
 * licence check, telemetry, the MCP registry, and the marketplace update check. All five used
 * the global `fetch`, which does not read HTTP_PROXY at all — so on a machine that reaches the
 * internet only through a proxy, all five failed silently. A sponsor's paid features went
 * unrecognised and update notices never arrived, on exactly the corporate machines most likely
 * to have a proxy in the first place.
 *
 * `node:https` is used instead of `fetch` for one reason: it accepts an `agent`, and `fetch`
 * does not. Node 24 added `NODE_USE_ENV_PROXY`, which is off by default and does not do SOCKS,
 * so it is not a way out of this.
 *
 * ── Loopback is never proxied ─────────────────────────────────────────────────────────────
 * A request to `localhost` is a request to this machine, and sending it through a corporate
 * proxy at best wastes a hop and at worst is refused. `claude` does send its localhost MCP
 * traffic to the proxy — observed, with `http://localhost:8000/mcp` arriving at a CONNECT
 * proxy — but that is its business and not a contract we have to match: these five requests
 * have no CLI equivalent for a user to compare against. The only loopback case we actually
 * have is the sponsor API pointed at a dev server through CCG_WWW_API_BASE, and routing that
 * through a proxy breaks local development for no gain.
 */

import { request as httpsRequest } from 'node:https';
import { request as httpRequest, type Agent, type IncomingMessage, type RequestOptions } from 'node:http';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

/** Read a proxy variable in either spelling, upper case first. */
function readProxyVar(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name] ?? env[name.toLowerCase()];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Hostnames that are this machine, and so are never sent to a proxy. */
function isLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host === '::1'
    || host === '0.0.0.0'
    || /^127\./.test(host);
}

/**
 * Whether NO_PROXY exempts this host.
 *
 * Follows the same shape the rest of the ecosystem uses: a comma-separated list, `*` for
 * everything, a leading dot or bare name matching the domain and its subdomains, and an
 * optional `:port` that has to match when present.
 */
export function isProxyBypassed(hostname: string, port: string, noProxy: string | undefined): boolean {
  if (isLoopback(hostname)) return true;
  if (!noProxy) return false;

  const entries = noProxy.split(',').map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  if (entries.includes('*')) return true;

  const target = hostname.toLowerCase();
  return entries.some((entry) => {
    let pattern = entry;
    let entryPort: string | undefined;
    // Only split a port off when it is unambiguous: a bare IPv6 literal is full of colons
    // and must not be chopped at the first one.
    const lastColon = pattern.lastIndexOf(':');
    if (lastColon > 0 && !pattern.slice(lastColon + 1).includes(']') && /^\d+$/.test(pattern.slice(lastColon + 1))) {
      entryPort = pattern.slice(lastColon + 1);
      pattern = pattern.slice(0, lastColon);
    }
    if (entryPort !== undefined && entryPort !== port) return false;
    if (pattern.startsWith('.')) pattern = pattern.slice(1);
    return target === pattern || target.endsWith(`.${pattern}`);
  });
}

/**
 * The proxy URL that applies to [targetUrl], or undefined for a direct connection.
 *
 * An https target falls back to HTTP_PROXY, which is a deliberate departure from curl and a
 * deliberate agreement with `claude`: given HTTP_PROXY alone, `claude` tunnels api.anthropic.com
 * through it, and a user who wrote one variable for `claude` should not have to write a second
 * one for us. Measured against a local CONNECT proxy.
 */
export function resolveProxyUrl(targetUrl: string, env: NodeJS.ProcessEnv): string | undefined {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    return undefined;
  }

  const isSecure = target.protocol === 'https:' || target.protocol === 'wss:';
  const port = target.port || (isSecure ? '443' : '80');

  if (isProxyBypassed(target.hostname, port, readProxyVar(env, 'NO_PROXY'))) return undefined;

  const specific = isSecure
    ? readProxyVar(env, 'HTTPS_PROXY') ?? readProxyVar(env, 'HTTP_PROXY')
    : readProxyVar(env, 'HTTP_PROXY');

  return specific ?? readProxyVar(env, 'ALL_PROXY');
}

/** An agent for [targetUrl], or undefined when the request should go out directly. */
export function proxyAgentFor(targetUrl: string, env: NodeJS.ProcessEnv): Agent | undefined {
  const proxyUrl = resolveProxyUrl(targetUrl, env);
  if (!proxyUrl) return undefined;

  try {
    return /^socks/i.test(new URL(proxyUrl).protocol)
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);
  } catch {
    // An unparseable proxy URL is the user's to fix, and going out direct is the closest
    // thing to what they asked for. Failing the request instead would take away a feature
    // over a typo in a variable we were only consulting.
    return undefined;
  }
}

export interface ProxiedResponse {
  status: number;
  ok: boolean;
  body: string;
}

export interface ProxiedRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** The environment to read the proxy from; resolve it for the project when there is one. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Send one request, through the user's proxy when they have one.
 *
 * Returns the body as text and never throws for an HTTP status: callers here all want to
 * decide for themselves what a 404 means, the same way they did with `fetch`.
 */
export function proxiedRequest(url: string, init: ProxiedRequestInit = {}): Promise<ProxiedResponse> {
  const env = init.env ?? process.env;
  const timeoutMs = init.timeoutMs ?? 10_000;

  return new Promise((resolve, reject) => {
    let target: URL;
    try {
      target = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    const proxyUrl = resolveProxyUrl(url, env);
    // http: as well as https:, because CCG_WWW_API_BASE points a developer at a plain-http
    // dev server. Sending an http: URL through the https client fails at the TLS handshake.
    const isPlainHttp = target.protocol === 'http:';
    const send = isPlainHttp ? httpRequest : httpsRequest;

    // A plain-http request is handed to an HTTP proxy as an absolute URI, not as a CONNECT
    // tunnel. Tunnelling would work only where the proxy allows CONNECT to port 80, which
    // corporate proxies routinely do not — they allow 443 and nothing else.
    const viaAbsoluteUri = isPlainHttp && proxyUrl !== undefined && !/^socks/i.test(proxyUrl);

    const options: RequestOptions = viaAbsoluteUri
      ? {
        method: init.method ?? 'GET',
        headers: absoluteUriHeaders(target, new URL(proxyUrl as string), init.headers),
        host: new URL(proxyUrl as string).hostname,
        port: new URL(proxyUrl as string).port || '80',
        path: target.toString(),
        timeout: timeoutMs,
      }
      : {
        method: init.method ?? 'GET',
        headers: init.headers,
        agent: proxyAgentFor(url, env),
        timeout: timeoutMs,
      };

    const handleResponse = (res: IncomingMessage): void => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({ status, ok: status >= 200 && status < 300, body });
      });
    };

    const req = viaAbsoluteUri
      ? send(options, handleResponse)
      : send(target, options, handleResponse);

    req.on('timeout', () => {
      // `timeout` does not abort on its own; without this the socket sits there and the
      // promise never settles.
      req.destroy(new Error(`Request to ${target.hostname} timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);

    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

/**
 * Headers for an absolute-URI request to an HTTP proxy.
 *
 * `Host` names the destination rather than the proxy, and credentials written into the proxy
 * URL travel as Proxy-Authorization — a corporate proxy that needs a login is the normal case,
 * not an exotic one.
 */
function absoluteUriHeaders(
  target: URL,
  proxy: URL,
  headers: Record<string, string> | undefined,
): Record<string, string> {
  const result: Record<string, string> = { Host: target.host, ...headers };
  if (proxy.username || proxy.password) {
    const credentials = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
    result['Proxy-Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`;
  }
  return result;
}
