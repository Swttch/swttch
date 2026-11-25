import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConnectionManager } from '../connection-manager';
import { handleSessionControl } from '../session-control-route';
import { releaseClaudeSession, sendInterruptToProcess } from '../../core/claude-process';
import { followSessionTranscript } from '../../core/features/sessionTranscriptFollower';

vi.mock('../../core/claude', () => ({ Claude: { killTree: vi.fn() } }));
vi.mock('../../core/claude-process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/claude-process')>()),
  releaseClaudeSession: vi.fn(async () => true),
  sendInterruptToProcess: vi.fn(() => true),
}));
vi.mock('../../core/features/turnEnds', () => ({
  turnEndCount: () => 0,
  waitForTurnEnd: vi.fn(async () => ({ ended: true, turnEnds: 1 })),
}));
vi.mock('../../core/features/sessionTranscriptFollower', () => ({ followSessionTranscript: vi.fn(async () => undefined) }));

const body = (o: unknown) => JSON.stringify(o);

// Another backend's tab takes a session over (TAKE_OVER_SESSION): this backend, which holds the CLI, is asked to let go.
describe('session-control release', () => {
  let cm: ConnectionManager;
  beforeEach(() => {
    cm = new ConnectionManager();
    vi.clearAllMocks();
  });

  function hold(turnStartedAt: number | null) {
    const session = { process: {}, subscribers: new Set(['screen-1']), workingDir: '/work' };
    vi.spyOn(cm, 'getSession').mockImplementation(((id: string) => (id === 's1' ? session : undefined)) as never);
    vi.spyOn(cm, 'getTurnStartedAt').mockReturnValue(turnStartedAt);
  }

  it('is refused when this backend holds no CLI for the session', async () => {
    const result = await handleSessionControl(cm, body({ sessionId: 's1', action: 'release' }));
    expect(result.status).toBe(404);
    expect(releaseClaudeSession).not.toHaveBeenCalled();
  });

  it('stops the CLI and makes the screens here follow the transcript, since another backend runs the session now', async () => {
    hold(null);
    const result = await handleSessionControl(cm, body({ sessionId: 's1', action: 'release' }));
    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(releaseClaudeSession).toHaveBeenCalledWith(cm, 's1');
    // without this the screen of the window that ran the session never learns that it is held elsewhere
    expect(followSessionTranscript).toHaveBeenCalledWith('screen-1', 's1', '/work', cm);
  });

  it('interrupts a turn in flight first when asked to, and lets an idle session go without an interrupt', async () => {
    hold(123);
    await handleSessionControl(cm, body({ sessionId: 's1', action: 'release', interrupt: true }));
    expect(sendInterruptToProcess).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendInterruptToProcess).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(releaseClaudeSession).mock.invocationCallOrder[0]);

    vi.clearAllMocks();
    hold(null);
    await handleSessionControl(cm, body({ sessionId: 's1', action: 'release', interrupt: true }));
    expect(sendInterruptToProcess).not.toHaveBeenCalled();
    expect(releaseClaudeSession).toHaveBeenCalledTimes(1);
  });

  it('is listed among the actions this backend can do', async () => {
    const result = await handleSessionControl(cm, body({ action: 'capabilities' }));
    expect((result.body.actions as string[]).includes('release')).toBe(true);
  });
});
