import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../bridge/authToken', () => ({
  ensureAuthTokenReady: () => new Promise(() => {}),
  authSubprotocols: () => [],
  isRemoteBlocked: () => false,
}));

const runtime = vi.hoisted(() => ({ jetbrains: false }));
vi.mock('../../../config/environment', () => ({
  isJetBrains: () => runtime.jetbrains,
}));

import { LogForwarder } from '../LogForwarder';

// Issue #723: in the JetBrains webview the native console is read only by
// idea.log, so a line below the forwarding floor must not reach it at all.
describe('LogForwarder native console passthrough', () => {
  const realConsole = { ...console };
  let forwarder: LogForwarder;
  let nativeDebug: ReturnType<typeof vi.fn>;
  let nativeLog: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nativeDebug = vi.fn();
    nativeLog = vi.fn();
    console.debug = nativeDebug as unknown as typeof console.debug;
    console.log = nativeLog as unknown as typeof console.log;
    forwarder = new LogForwarder();
  });

  afterEach(() => {
    forwarder.dispose();
    Object.assign(console, realConsole);
  });

  it('JetBrains: skips the native console below the floor but keeps it in history', () => {
    runtime.jetbrains = true;
    forwarder.start();
    console.debug('[Bridge] Received message:', 'CLI_EVENT');
    console.log('visible');

    expect(nativeDebug).not.toHaveBeenCalled();
    expect(nativeLog).toHaveBeenCalledTimes(1);
    expect(forwarder.getHistoryText()).toContain('Received message');
  });

  it('JetBrains: passes debug through once the floor is lowered', () => {
    runtime.jetbrains = true;
    forwarder.start();
    forwarder.setLevel('debug');
    console.debug('traced');

    expect(nativeDebug).toHaveBeenCalledTimes(1);
  });

  it('standalone browser: still calls the native console for debug', () => {
    runtime.jetbrains = false;
    forwarder.start();
    console.debug('traced');

    expect(nativeDebug).toHaveBeenCalledTimes(1);
  });

  // "Debug Mode" lowers the floor, which is what lets a debug line out of the webview at all.
  it('JetBrains: Debug Mode lets debug through, and turning it off closes it again', () => {
    runtime.jetbrains = true;
    forwarder.start();

    forwarder.setDebugLogging(true);
    console.debug('traced');
    expect(nativeDebug).toHaveBeenCalledTimes(1);

    forwarder.setDebugLogging(false);
    console.debug('traced again');
    expect(nativeDebug).toHaveBeenCalledTimes(1);
  });
});
