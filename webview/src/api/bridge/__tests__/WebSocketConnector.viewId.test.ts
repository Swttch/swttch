import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketConnector } from '../WebSocketConnector';
import { _resetPanelIdCache } from '../resolvePanelId';
import { _resetRuntimeCache } from '../../../config/environment';

/*
 * A split editor tab shows one panel in two views (#753). The IDE names each view on the page URL,
 * and the page has to pass that name on when it connects, so a key or a file drop meant for one
 * view is not handed to the other.
 */
class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  onopen: unknown = null;
  onmessage: unknown = null;
  onclose: unknown = null;
  onerror: unknown = null;
  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(): void {}
  close(): void {}
}

describe('WebSocketConnector — which view is connecting', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    window.__JCEF__ = true;
    _resetRuntimeCache();
    _resetPanelIdCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__JCEF__;
    window.history.pushState({}, '', '/');
    _resetRuntimeCache();
    _resetPanelIdCache();
  });

  async function socketUrl(search: string): Promise<URL> {
    window.history.pushState({}, '', search);
    const connector = new WebSocketConnector();
    void connector.connect().catch(() => {});
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    connector.disconnect();
    return new URL(FakeWebSocket.instances[0].url);
  }

  it('passes the view the IDE named on to the backend', async () => {
    const url = await socketUrl('/sessions/new?panelId=tab-1&viewId=view-9');

    expect(url.searchParams.get('panelId')).toBe('tab-1');
    expect(url.searchParams.get('viewId')).toBe('view-9');
  });

  it('sends no view when the page was not given one', async () => {
    const url = await socketUrl('/sessions/new?panelId=tab-1');

    expect(url.searchParams.has('viewId')).toBe(false);
  });
});
