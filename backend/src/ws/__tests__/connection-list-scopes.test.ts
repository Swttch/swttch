import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionManager } from '../connection-manager';

vi.mock('../../core/claude', () => ({ Claude: { killTree: vi.fn() } }));

function createMockWs() {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as import('ws').WebSocket;
}

const received = (ws: import('ws').WebSocket) =>
  (ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([data]) => JSON.parse(data as string));

/**
 * A screen's list is made of one folder, and of the folders below it when asked. News about one session
 * is sent to the screens whose list the session can be in, which is found out from the lists they asked for.
 */
describe('sending to the screens whose list can hold a session', () => {
  let cm: ConnectionManager;

  beforeEach(() => {
    cm = new ConnectionManager();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  function connect(scope?: { rootDir: string; includeNested: boolean }) {
    const ws = createMockWs();
    const id = cm.addConnection(ws);
    if (scope) cm.registerListScope(id, scope);
    return { ws, id };
  }

  it('sends to a screen that listed the session folder, and not to one that listed another', () => {
    const here = connect({ rootDir: '/repo', includeNested: false });
    const elsewhere = connect({ rootDir: '/repo-worktrees/fix-673', includeNested: true });

    cm.broadcastToListsHolding('T', { a: 1 }, ['/repo']);

    expect(received(here.ws).map((m) => m.type)).toEqual(['T']);
    expect(received(elsewhere.ws)).toEqual([]);
  });

  it('sends to a screen whose list takes the folders below it', () => {
    const nested = connect({ rootDir: '/repo', includeNested: true });
    const alone = connect({ rootDir: '/repo', includeNested: false });

    cm.broadcastToListsHolding('T', {}, ['/repo/packages/ui']);

    expect(received(nested.ws)).toHaveLength(1);
    expect(received(alone.ws)).toEqual([]);
  });

  it('sends to a screen that has not said what its list is, because it can not be told apart', () => {
    const unknown = connect();

    cm.broadcastToListsHolding('T', {}, ['/anywhere']);

    expect(received(unknown.ws)).toHaveLength(1);
  });

  it('sends to everyone when the folders of the session are not known', () => {
    const a = connect({ rootDir: '/a', includeNested: false });
    const b = connect({ rootDir: '/b', includeNested: false });

    cm.broadcastToListsHolding('T', {}, []);

    expect(received(a.ws)).toHaveLength(1);
    expect(received(b.ws)).toHaveLength(1);
  });

  it('skips the connection it is told to', () => {
    const a = connect({ rootDir: '/repo', includeNested: false });
    const b = connect({ rootDir: '/repo', includeNested: false });

    cm.broadcastToListsHolding('T', {}, ['/repo'], a.id);

    expect(received(a.ws)).toEqual([]);
    expect(received(b.ws)).toHaveLength(1);
  });

  it('goes by the list a screen asked for last, for the same folder', () => {
    const screen = connect({ rootDir: '/repo', includeNested: false });
    cm.registerListScope(screen.id, { rootDir: '/repo', includeNested: true });

    cm.broadcastToListsHolding('T', {}, ['/repo/packages/ui']);

    expect(received(screen.ws)).toHaveLength(1);
  });

  it('holds each folder a screen asked for', () => {
    const screen = connect({ rootDir: '/a', includeNested: false });
    cm.registerListScope(screen.id, { rootDir: '/b', includeNested: false });

    cm.broadcastToListsHolding('T', {}, ['/a']);
    cm.broadcastToListsHolding('T', {}, ['/b']);
    cm.broadcastToListsHolding('T', {}, ['/c']);

    expect(received(screen.ws)).toHaveLength(2);
  });

  it('forgets what a screen asked for when it goes', () => {
    const screen = connect({ rootDir: '/repo', includeNested: false });
    const other = connect({ rootDir: '/repo', includeNested: false });
    cm.removeConnection(screen.id);

    cm.broadcastToListsHolding('T', {}, ['/repo']);

    expect(received(screen.ws)).toEqual([]);
    expect(received(other.ws)).toHaveLength(1);
  });
});
