import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

vi.mock('../../claude', () => ({
  // applyConfigDir alongside spawn: `auth login` WRITES the credential, so the handler settles
  // which Claude data directory it belongs to before spawning.
  Claude: { spawn: vi.fn(), applyConfigDir: vi.fn().mockResolvedValue(undefined) },
}));

import { loginHandler, cancelLogin, extractOAuthUrl } from '../login';
import { Claude } from '../../claude';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

const mockSpawn = vi.mocked(Claude.spawn);

type FakeChild = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { writable: boolean; write: ReturnType<typeof vi.fn> };
};

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.kill = vi.fn();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { writable: true, write: vi.fn() };
  return child;
}

function createMockConnections() {
  return { sendTo: vi.fn() } as unknown as ConnectionManager;
}

const mockBridge = { openUrl: vi.fn() } as unknown as Bridge;

/**
 * Wait until the handler has actually spawned the CLI.
 *
 * The handler settles the Claude data directory before spawning — `auth login` WRITES the
 * credential, so which directory it belongs to has to be decided first — and that await puts
 * the spawn a microtask later than the call. Emitting on the fake child before then would be
 * emitting at a child nothing is listening to yet.
 */
async function waitForSpawn(): Promise<void> {
  for (let i = 0; i < 20 && mockSpawn.mock.calls.length === 0; i++) {
    await Promise.resolve();
  }
}

async function runLogin(method: unknown, exitCode: number, connections = createMockConnections()) {
  const child = fakeChild();
  mockSpawn.mockReturnValue(child as never);
  const message: IPCMessage = { type: MessageType.LOGIN, payload: method === undefined ? {} : { method }, requestId: 'r1', timestamp: 0 };
  const promise = loginHandler('c1', message, connections, mockBridge);
  await waitForSpawn();
  child.emit('close', exitCode);
  await promise;
  return connections;
}

describe('loginHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps method "console" to the --console flag', async () => {
    await runLogin('console', 0);
    expect(mockSpawn).toHaveBeenCalledWith(['auth', 'login', '--console'], expect.anything());
  });

  it('maps method "claude-ai" to the --claudeai flag', async () => {
    await runLogin('claude-ai', 0);
    expect(mockSpawn).toHaveBeenCalledWith(['auth', 'login', '--claudeai'], expect.anything());
  });

  it('defaults to --claudeai when no method is provided', async () => {
    await runLogin(undefined, 0);
    expect(mockSpawn).toHaveBeenCalledWith(['auth', 'login', '--claudeai'], expect.anything());
  });

  it('sends an ok ACK when the CLI exits 0', async () => {
    const connections = await runLogin('console', 0);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({
      requestId: 'r1',
      status: 'ok',
    }));
  });

  it('sends an error ACK when the CLI exits non-zero', async () => {
    const connections = await runLogin('console', 1);
    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({
      requestId: 'r1',
      status: 'error',
    }));
  });
});

// The CLI (claude auth login) always prints the OAuth URL with an "If the browser
// didn't open, visit:" notice — and, where it can, also opens the browser ITSELF.
// It does not tell us through stdout whether that auto-open succeeded, so we must
// NOT open the URL ourselves (that double-opens on macOS/Windows). Instead we
// forward the URL to the webview, which shows it and lets the user open it.
describe('loginHandler OAuth URL forwarding', () => {
  beforeEach(() => vi.clearAllMocks());

  async function startLogin(connections = createMockConnections()) {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);
    const message: IPCMessage = { type: MessageType.LOGIN, payload: { method: 'claude-ai' }, requestId: 'r1', timestamp: 0 };
    const promise = loginHandler('c1', message, connections, mockBridge);
    await waitForSpawn();
    return { child, connections, promise };
  }

  const URL = 'https://claude.ai/oauth/authorize?code=abc123&state=xyz';

  it('forwards the OAuth URL to the webview and does NOT open it directly', async () => {
    const { child, connections, promise } = await startLogin();

    child.stdout.emit('data', Buffer.from(`Opening browser to sign in…\nIf the browser didn't open, visit: ${URL}\n`));

    expect(connections.sendTo).toHaveBeenCalledWith('c1', MessageType.LOGIN_URL_AVAILABLE, expect.objectContaining({
      requestId: 'r1',
      url: URL,
    }));
    expect(vi.mocked((mockBridge as unknown as { openUrl: ReturnType<typeof vi.fn> }).openUrl)).not.toHaveBeenCalled();

    child.emit('close', 0);
    await promise;
  });

  it('forwards the URL only once even when it spans multiple chunks', async () => {
    const { child, connections, promise } = await startLogin();

    child.stdout.emit('data', Buffer.from('If the browser didn\'t open, visit: https://claude.ai/oauth/'));
    child.stdout.emit('data', Buffer.from('authorize?code=abc123&state=xyz\n'));
    child.stdout.emit('data', Buffer.from('still streaming more output...\n'));

    const urlCalls = vi.mocked(connections.sendTo).mock.calls.filter(([, type]) => type === MessageType.LOGIN_URL_AVAILABLE);
    expect(urlCalls).toHaveLength(1);
    expect(urlCalls[0][2]).toMatchObject({ url: URL });

    child.emit('close', 0);
    await promise;
  });
});

describe('cancelLogin', () => {
  beforeEach(() => vi.clearAllMocks());

  it('kills the in-flight login child for the connection and forgets it', async () => {
    const child = fakeChild();
    mockSpawn.mockReturnValue(child as never);
    const connections = createMockConnections();
    const message: IPCMessage = { type: MessageType.LOGIN, payload: { method: 'claude-ai' }, requestId: 'r1', timestamp: 0 };
    // Login is in flight: the child has NOT closed yet.
    void loginHandler('c1', message, connections, mockBridge);
    await waitForSpawn();

    expect(cancelLogin('c1')).toBe(true);
    expect(child.kill).toHaveBeenCalled();

    // The child is forgotten, so a second cancel is a no-op.
    expect(cancelLogin('c1')).toBe(false);
  });

  it('returns false when the connection has no in-flight login', () => {
    expect(cancelLogin('no-such-connection')).toBe(false);
  });
});

describe('extractOAuthUrl', () => {
  const URL = 'https://claude.ai/oauth/authorize?code=abc123&state=xyz';

  it('extracts a bare OAuth URL', () => {
    expect(extractOAuthUrl(`Visit: ${URL}`)).toBe(URL);
  });

  it('matches the console authorize host too', () => {
    const consoleUrl = 'https://console.anthropic.com/oauth/authorize?code=q';
    expect(extractOAuthUrl(`open ${consoleUrl}`)).toBe(consoleUrl);
  });

  it('strips ANSI color codes wrapping the URL', () => {
    // Ink renders the URL underlined/colored: ESC[4m ... ESC[0m
    const colored = `\x1b[4m${URL}\x1b[0m`;
    expect(extractOAuthUrl(colored)).toBe(URL);
  });

  it('strips ANSI codes embedded mid-URL', () => {
    const split = `https://claude.ai/oauth/\x1b[0mauthorize?code=abc123&state=xyz`;
    expect(extractOAuthUrl(split)).toBe(URL);
  });

  it('trims trailing punctuation and quotes', () => {
    expect(extractOAuthUrl(`visit "${URL}".`)).toBe(URL);
    expect(extractOAuthUrl(`(${URL})`)).toBe(URL);
  });

  it('returns null when there is no OAuth URL', () => {
    expect(extractOAuthUrl('no url here, just text')).toBeNull();
    expect(extractOAuthUrl('https://example.com/login')).toBeNull();
  });
});
