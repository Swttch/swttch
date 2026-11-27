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
    cm.setProcess('sess-1', { pid: 1, once: vi.fn() } as never);
    cm.getOrCreateSession('sess-1').lastCliEventAt = T0;
    cm.getOrCreateSession('sess-1').turnUnanswered = false;
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
    cm.getOrCreateSession('sess-1').turnUnanswered = true;
    expect(await stopIdleSessions(cm, later)).toEqual([]);
  });

  // #761: the lines a real CLI prints, in the order measured on 2.1.332. Judged from the events themselves, so that
  // what keeps a session from being stopped is what the CLI actually said.
  describe('read from the CLI’s own events', () => {
    const emit = (...events: Array<Record<string, unknown>>) => {
      for (const event of events) cm.broadcastToSession('sess-1', MessageType.CLI_EVENT, event);
      cm.getOrCreateSession('sess-1').lastCliEventAt = T0;
    };
    const turn = [
      { type: 'system', subtype: 'init' },
      { type: 'stream_event' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }] } },
      { type: 'result' },
    ];
    const stopped = async () => (await stopIdleSessions(cm, later)).length === 1;

    it('stops a session whose answer ended, whatever notices trail the result', async () => {
      emit(
        ...turn,
        { type: 'command_lifecycle', state: 'completed' },
        { type: 'system', subtype: 'task_summary' },
        { type: 'control_response', response: {} },
        { type: 'rate_limit_event' },
      );
      expect(await stopped()).toBe(true);
    });

    it('leaves it from the moment a message is handed to the CLI until the result', async () => {
      emit(...turn);
      cm.noteTurnStarted('sess-1');
      expect(await stopped()).toBe(false);
      emit({ type: 'result' });
      expect(await stopped()).toBe(true);
    });

    it('leaves it during a turn the CLI started by itself', async () => {
      emit(...turn, { type: 'system', subtype: 'task_notification' }, { type: 'system', subtype: 'init' });
      expect(await stopped()).toBe(false);
    });

    it('is not held by what a sub-agent says after the answer ended', async () => {
      emit(...turn, { type: 'assistant', parent_tool_use_id: 'agent-1', message: { content: [] } }, { type: 'user', parent_tool_use_id: 'agent-1' });
      expect(await stopped()).toBe(true);
    });

    for (const tool of ['CronCreate', 'ScheduleWakeup']) {
      it(`never stops a CLI that scheduled work with ${tool}, which lives in that process`, async () => {
        emit({ type: 'system', subtype: 'init' }, { type: 'assistant', message: { content: [{ type: 'tool_use', name: tool, input: {} }] } }, { type: 'result' });
        expect(await stopped()).toBe(false);
      });
    }

    it('forgets the scheduled work with the process that held it', async () => {
      emit({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'CronCreate', input: {} }] } }, { type: 'result' });
      cm.setProcess('sess-1', null);
      cm.setProcess('sess-1', { pid: 2, once: vi.fn() } as never);
      emit(...turn);
      expect(await stopped()).toBe(true);
    });
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
    cm.setProcess('sess-1', { pid: 1, once: vi.fn() } as never);

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
