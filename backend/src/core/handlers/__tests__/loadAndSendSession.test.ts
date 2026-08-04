import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../features/loadSessionMessages', () => ({
  loadSessionMessages: vi.fn(),
}));
vi.mock('../../features/workflow-tracker', () => ({
  reconstructWorkflowTasks: vi.fn(),
}));
vi.mock('../../claude-process', () => ({
  isWorkflowRunning: vi.fn(() => false),
}));

import { loadAndSendSession } from '../loadAndSendSession';
import { loadSessionMessages } from '../../features/loadSessionMessages';
import { reconstructWorkflowTasks } from '../../features/workflow-tracker';
import type { ConnectionManager } from '../../../ws/connection-manager';
import { MessageType } from '../../../shared';

const mockLoad = vi.mocked(loadSessionMessages);
const mockReconstruct = vi.mocked(reconstructWorkflowTasks);

interface SentMessage {
  type: string;
  payload: Record<string, unknown>;
}

function makeConnections(): { conn: ConnectionManager; sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  const conn = {
    sendTo: (_id: string, type: string, payload: Record<string, unknown>) => {
      sent.push({ type, payload });
    },
  } as unknown as ConnectionManager;
  return { conn, sent };
}

describe('loadAndSendSession', () => {
  // The returned page is the latest slice; activeChain is the full history that
  // extends further back than the page.
  const pageMessages = [{ type: 'user', uuid: 'u99' }];
  const fullChain = [
    { type: 'assistant', uuid: 'u1' },
    { type: 'user', uuid: 'u99' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoad.mockResolvedValue({
      messages: pageMessages,
      hasMore: true,
      oldestUuid: 'u99',
      total: 100,
      activeChain: fullChain,
      lastReportedMode: null,
    });
    mockReconstruct.mockResolvedValue([]);
  });

  it('forwards the pagination limit to loadSessionMessages (reclaim regression)', async () => {
    const { conn } = makeConnections();
    await loadAndSendSession('conn-1', conn, '/work', 'sess-1', {
      limit: 1_000_000,
    });
    // signature: (workingDir, sessionId, beforeUuid, limit)
    expect(mockLoad).toHaveBeenCalledWith('/work', 'sess-1', undefined, 1_000_000);
  });

  it('sends SESSION_LOADED with the paging fields and prepend=false on initial load', async () => {
    const { conn, sent } = makeConnections();
    await loadAndSendSession('conn-1', conn, '/work', 'sess-1', {});

    const loaded = sent.find((m) => m.type === MessageType.SESSION_LOADED);
    expect(loaded?.payload).toMatchObject({
      sessionId: 'sess-1',
      hasMore: true,
      oldestUuid: 'u99',
      prepend: false,
    });
    // The full active chain stays backend-side — never forwarded to the webview.
    expect(loaded?.payload).not.toHaveProperty('activeChain');
  });

  it('reconstructs workflows from the full active chain, not just the page', async () => {
    const { conn } = makeConnections();
    await loadAndSendSession('conn-1', conn, '/work', 'sess-1', {});
    expect(mockReconstruct).toHaveBeenCalledOnce();
    // Must receive the whole chain (u1 + u99), not the latest page (u99 only) —
    // otherwise workflows older than the page are dropped on reload.
    expect(mockReconstruct.mock.calls[0][0]).toEqual(fullChain);
  });

  it('marks prepend=true and skips workflow reconstruction for an older page', async () => {
    const { conn, sent } = makeConnections();
    await loadAndSendSession('conn-1', conn, '/work', 'sess-1', {
      beforeUuid: 'u9',
      limit: 50,
      isOlderPage: true,
    });

    const loaded = sent.find((m) => m.type === MessageType.SESSION_LOADED);
    expect(loaded?.payload).toMatchObject({ prepend: true });
    expect(mockLoad).toHaveBeenCalledWith('/work', 'sess-1', 'u9', 50);
    expect(mockReconstruct).not.toHaveBeenCalled();
  });
});
