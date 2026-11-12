import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConnectionManager } from '../../../ws/connection-manager';
import { IDLE_HIDDEN_MS, IDLE_QUIET_MS, stopIdleSessions } from '../idleSessions';
import * as claudeProcess from '../../claude-process';
import * as messageQueue from '../messageQueue';
import * as workflowTracker from '../workflow-tracker';
import { MessageType } from '../../../shared';

vi.mock('../../claude', () => ({ Claude: { killTree: vi.fn() } }));
vi.mock('../../claude-process', () => ({ restartClaudeSessionProcess: vi.fn().mockResolvedValue(undefined) }));

// A session whose CLI is running for nobody is stopped; one that is watched, working,
// waiting on a person or holding something the stop would lose is left alone. Each case
// below differs from the stoppable one by exactly one thing.

function createWs() {
  return { readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as import('ws').WebSocket;
}

const T0 = 1_000_000;

describe('stopIdleSessions', () => {
  let cm: ConnectionManager;
  let connId: string;
  const restart = vi.mocked(claudeProcess.restartClaudeSessionProcess);

  /** A hidden screen on a session whose CLI finished its turn at T0 and has been quiet since. */
  beforeEach(() => {
    restart.mockClear();
    cm = new ConnectionManager();
    connId = cm.addConnection(createWs());
    cm.subscribe(connId, 'sess-1');
    cm.setProcess('sess-1', { pid: 1 } as never);
    cm.getOrCreateSession('sess-1').lastCliEventAt = T0;
    cm.getOrCreateSession('sess-1').cliTurnOpen = false;
    cm.setPanelVisibility(connId, false, T0);
  });

  afterEach(() => vi.restoreAllMocks());

  const later = T0 + Math.max(IDLE_HIDDEN_MS, IDLE_QUIET_MS) + 1;

  it('stops the CLI once the screen has been hidden and the CLI quiet long enough', async () => {
    expect(await stopIdleSessions(cm, later)).toEqual(['sess-1']);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(restart.mock.calls[0][1]).toBe('sess-1');
  });

  it('leaves it while the screen has not been hidden long enough', async () => {
    cm.setPanelVisibility(connId, true);
    cm.setPanelVisibility(connId, false, later - IDLE_HIDDEN_MS + 1);
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it when the screen is showing again', async () => {
    cm.setPanelVisibility(connId, true);
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it when any one of several screens is still showing', async () => {
    const other = cm.addConnection(createWs());
    cm.subscribe(other, 'sess-1');
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it when a screen never reported, so an unknown host is not taken for an empty one', async () => {
    cm.unsubscribe(connId);
    const silent = cm.addConnection(createWs());
    cm.subscribe(silent, 'sess-1');
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it while the turn is still open', async () => {
    cm.getOrCreateSession('sess-1').cliTurnOpen = true;
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it when the CLI spoke within the quiet period', async () => {
    cm.getOrCreateSession('sess-1').lastCliEventAt = later - IDLE_QUIET_MS + 1;
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it while a card waits for an answer', async () => {
    cm.rememberOpenRequest('sess-1', { type: 'control_request', request_id: 'r1' });
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it while a message is queued for it', async () => {
    vi.spyOn(messageQueue, 'getQueuedMessages').mockReturnValue([{ id: 'q', content: 'x', queuedAt: 0 }]);
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('leaves it while background work of its own is running', async () => {
    vi.spyOn(workflowTracker, 'peekWorkflowTracker').mockReturnValue({
      hasRunning: () => true,
    } as unknown as workflowTracker.WorkflowProgressTracker);
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('does not touch a session no screen is attached to; the orphan cleanup owns it', async () => {
    cm.unsubscribe(connId);
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  it('counts hidden time from the first report, so a repeated report does not restart the clock', async () => {
    cm.setPanelVisibility(connId, false, later - 1);
    expect(await stopIdleSessions(cm, later)).toEqual(['sess-1']);
  });
});

describe('REPORT_PANEL_VISIBILITY handler', () => {
  it('records the report on the sending connection and acknowledges it', async () => {
    const { reportPanelVisibilityHandler } = await import('../../handlers/sessionActivity');
    const cm = new ConnectionManager();
    const ws = createWs();
    const connId = cm.addConnection(ws);
    cm.subscribe(connId, 'sess-1');
    cm.setProcess('sess-1', { pid: 1 } as never);

    reportPanelVisibilityHandler(
      connId,
      { type: MessageType.REPORT_PANEL_VISIBILITY, payload: { visible: false }, requestId: 'x' } as never,
      cm,
      {} as never,
    );

    expect(cm.getClient(connId)?.hiddenSince).not.toBeNull();
    expect(
      (ws.send as ReturnType<typeof vi.fn>).mock.calls.some((c) => JSON.parse(c[0] as string).type === MessageType.ACK),
    ).toBe(true);
  });

  it('ignores a payload that is not a boolean', async () => {
    const { reportPanelVisibilityHandler } = await import('../../handlers/sessionActivity');
    const cm = new ConnectionManager();
    const connId = cm.addConnection(createWs());
    reportPanelVisibilityHandler(
      connId,
      { type: MessageType.REPORT_PANEL_VISIBILITY, payload: { visible: 'no' } } as never,
      cm,
      {} as never,
    );
    expect(cm.getClient(connId)?.hiddenSince).toBeNull();
  });
});
