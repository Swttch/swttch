import { describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { resolveProxyUrl, isProxyBypassed, proxiedRequest } from '../outbound-proxy';

/**
 * The backend's own outbound requests, and the proxy they go through.
 *
 * All five of them used the global `fetch`, which does not read HTTP_PROXY. On a machine that
 * reaches the internet only through a proxy they therefore failed in silence: a sponsor's paid
 * features went unrecognised and update notices never arrived.
 *
 * The end-to-end case below judges by what the PROXY SAW, not by whether the request
 * succeeded. On a machine that can reach the destination directly, skipping the proxy succeeds
 * too — so "it worked" proves nothing at all. That mistake shipped once already, in the first
 * attempt at honouring HTTP_PROXY for usage stats (#432): the variable was passed correctly,
 * every test passed, and nothing changed for the person who reported it.
 */

describe('resolveProxyUrl', () => {
  it('sends an https target through HTTPS_PROXY', () => {
    const env = { HTTPS_PROXY: 'http://proxy.corp:3128' };
    expect(resolveProxyUrl('https://api.example.com/x', env)).toBe('http://proxy.corp:3128');
  });

  it('falls back to HTTP_PROXY for an https target, as claude does', () => {
    // A deliberate departure from curl, which would never apply HTTP_PROXY to an https URL.
    // `claude` does apply it, and a user who wrote one variable for `claude` should not have
    // to write a second one for us.
    const env = { HTTP_PROXY: 'http://proxy.corp:3128' };
    expect(resolveProxyUrl('https://api.example.com/x', env)).toBe('http://proxy.corp:3128');
  });

  it('reads the lower-case spelling too', () => {
    const env = { https_proxy: 'http://proxy.corp:3128' };
    expect(resolveProxyUrl('https://api.example.com/x', env)).toBe('http://proxy.corp:3128');
  });

  it('falls back to ALL_PROXY when nothing more specific is set', () => {
    const env = { ALL_PROXY: 'socks5://proxy.corp:1080' };
    expect(resolveProxyUrl('https://api.example.com/x', env)).toBe('socks5://proxy.corp:1080');
  });

  it('goes direct when no proxy is configured', () => {
    expect(resolveProxyUrl('https://api.example.com/x', {})).toBeUndefined();
  });

  it('never proxies loopback, even with a proxy configured and no NO_PROXY', () => {
    const env = { HTTPS_PROXY: 'http://proxy.corp:3128', HTTP_PROXY: 'http://proxy.corp:3128' };
    // A request to this machine is not a request that needs a hop through the company. The
    // real case is the sponsor API pointed at a dev server through CCG_WWW_API_BASE.
    expect(resolveProxyUrl('http://localhost:8080/api', env)).toBeUndefined();
    expect(resolveProxyUrl('http://127.0.0.1:8080/api', env)).toBeUndefined();
    expect(resolveProxyUrl('http://[::1]:8080/api', env)).toBeUndefined();
  });

  it('ignores a blank proxy value rather than treating it as configured', () => {
    expect(resolveProxyUrl('https://api.example.com/x', { HTTPS_PROXY: '   ' })).toBeUndefined();
  });
});

describe('isProxyBypassed', () => {
  it('exempts an exact host', () => {
    expect(isProxyBypassed('internal.corp', '443', 'internal.corp')).toBe(true);
  });

  it('exempts subdomains of a listed domain', () => {
    expect(isProxyBypassed('api.internal.corp', '443', '.internal.corp')).toBe(true);
  });

  it('exempts everything for *', () => {
    expect(isProxyBypassed('api.example.com', '443', '*')).toBe(true);
  });

  it('honours a port when the entry names one', () => {
    expect(isProxyBypassed('internal.corp', '443', 'internal.corp:8080')).toBe(false);
    expect(isProxyBypassed('internal.corp', '8080', 'internal.corp:8080')).toBe(true);
  });

  it('does not exempt an unrelated host', () => {
    expect(isProxyBypassed('api.example.com', '443', 'internal.corp')).toBe(false);
  });
});

describe('proxiedRequest, judged by what the proxy saw', () => {
  /** A proxy that records what reached it and answers everything itself. */
  function recordingProxy(): Promise<{ server: Server; port: number; seen: string[] }> {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      seen.push(`REQUEST ${req.url}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ throughProxy: true }));
    });
    server.on('connect', (req, socket) => {
      seen.push(`CONNECT ${req.url}`);
      socket.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');
    });
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        resolve({ server, port, seen });
      });
    });
  }

  it('an http request reaches the configured proxy', async () => {
    const { server, port, seen } = await recordingProxy();
    try {
      const res = await proxiedRequest('http://example.invalid/announcements', {
        env: { HTTP_PROXY: `http://127.0.0.1:${port}` },
        timeoutMs: 5000,
      });

      // The proxy answered, which it could only do because the request arrived there.
      expect(seen).toEqual(['REQUEST http://example.invalid/announcements']);
      expect(res.ok).toBe(true);
      expect(JSON.parse(res.body)).toEqual({ throughProxy: true });
    } finally {
      server.close();
    }
  });

  it('an https request opens a CONNECT tunnel at the configured proxy', async () => {
    const { server, port, seen } = await recordingProxy();
    try {
      await proxiedRequest('https://example.invalid/sponsor/status', {
        env: { HTTPS_PROXY: `http://127.0.0.1:${port}` },
        timeoutMs: 5000,
      }).catch(() => undefined); // the proxy refuses the tunnel; only the attempt matters

      expect(seen).toEqual(['CONNECT example.invalid:443']);
    } finally {
      server.close();
    }
  });

  it('a loopback destination does not reach the proxy at all', async () => {
    const { server, port, seen } = await recordingProxy();
    const destination = await recordingProxy();
    try {
      const res = await proxiedRequest(`http://127.0.0.1:${destination.port}/api/sponsor`, {
        env: { HTTP_PROXY: `http://127.0.0.1:${port}` },
        timeoutMs: 5000,
      });

      expect(seen).toEqual([]);
      expect(destination.seen).toEqual(['REQUEST /api/sponsor']);
      expect(res.ok).toBe(true);
    } finally {
      server.close();
      destination.server.close();
    }
  });
});
