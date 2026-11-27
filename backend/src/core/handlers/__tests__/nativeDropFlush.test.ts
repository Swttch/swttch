import { describe, it, expect, vi, beforeEach } from 'vitest';
import { nativeDropFlushHandler } from '../nativeDropFlush';
import { resolveDroppedPaths } from '../../features/macDragPasteboard';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType } from '../../../shared';

vi.mock('../../features/macDragPasteboard', () => ({ resolveDroppedPaths: vi.fn() }));

const message = { type: MessageType.NATIVE_DROP_FLUSH, requestId: 'r1', timestamp: 0 };

function connectionsHolding(stash: unknown) {
  const sendTo = vi.fn();
  const takeNativeDropStash = vi.fn().mockReturnValue(stash);
  return { connections: { sendTo, takeNativeDropStash } as unknown as ConnectionManager, sendTo };
}

describe('nativeDropFlushHandler', () => {
  beforeEach(() => vi.mocked(resolveDroppedPaths).mockReset());

  it('sends the resolved paths, and only then answers the flush', async () => {
    vi.mocked(resolveDroppedPaths).mockImplementation(async () => {
      await Promise.resolve();
      return [{ path: '/Users/a/demo/README.txt', type: 'file' }];
    });
    const { connections, sendTo } = connectionsHolding([{ path: 'README.txt', type: 'file' }]);

    await nativeDropFlushHandler('c1', message, connections, {} as Bridge);

    expect(resolveDroppedPaths).toHaveBeenCalledWith([{ path: 'README.txt', type: 'file' }]);
    expect(sendTo.mock.calls).toEqual([
      ['c1', MessageType.NATIVE_DROP_ENTRIES, { entries: [{ path: '/Users/a/demo/README.txt', type: 'file' }] }],
      ['c1', MessageType.ACK, { requestId: 'r1' }],
    ]);
  });

  it('sends no entries when none could be resolved, so the page can say the drop was not read', async () => {
    vi.mocked(resolveDroppedPaths).mockResolvedValue([]);
    const { connections, sendTo } = connectionsHolding([{ path: 'README.txt', type: 'file' }]);

    await nativeDropFlushHandler('c1', message, connections, {} as Bridge);

    expect(sendTo.mock.calls).toEqual([['c1', MessageType.ACK, { requestId: 'r1' }]]);
  });

  it('only answers when nothing was stashed', async () => {
    const { connections, sendTo } = connectionsHolding(null);

    await nativeDropFlushHandler('c1', message, connections, {} as Bridge);

    expect(resolveDroppedPaths).not.toHaveBeenCalled();
    expect(sendTo.mock.calls).toEqual([['c1', MessageType.ACK, { requestId: 'r1' }]]);
  });
});
