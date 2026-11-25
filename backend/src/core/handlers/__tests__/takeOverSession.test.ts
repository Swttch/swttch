import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import { MessageType } from '../../../shared';
import { getSessionHolderHandler, takeOverSessionHandler } from '../takeOverSession';
import { askHolderActivity, callHolder } from '../../forward-to-holder';
import { findLiveCliForSession, killRegisteredCli } from '../../cli-registry';
import { ensureClaudeProcess, markSessionAsSpawned } from '../../claude-process';

vi.mock('../../forward-to-holder', () => ({ askHolderActivity: vi.fn(), callHolder: vi.fn() }));
vi.mock('../../cli-registry', () => ({ findLiveCliForSession: vi.fn(), killRegisteredCli: vi.fn(async () => undefined) }));
vi.mock('../../claude-process', () => ({ ensureClaudeProcess: vi.fn(async () => undefined), markSessionAsSpawned: vi.fn() }));

const OTHER_BACKEND_PID = process.pid + 1;
const entry = (control: boolean) => ({
  pid: 4242,
  sessionId: 's1',
  workingDir: '/held/folder',
  startedAt: '2026-11-25T00:00:00Z',
  owner: { pid: OTHER_BACKEND_PID, argv1: 'x' },
  ...(control ? { control: { port: 1, token: 't' } } : {}),
});
const heldBy = (e: ReturnType<typeof entry>) => vi.mocked(findLiveCliForSession).mockReturnValue({ entry: e, ownerAlive: true } as never);

function setup(opts: { cliStartsHere?: boolean; sessionWorkingDir?: string } = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const connections = {
    sendTo: (_id: string, _type: string, payload: Record<string, unknown>) => void sent.push(payload),
    getSession: () => (opts.sessionWorkingDir === undefined ? undefined : { workingDir: opts.sessionWorkingDir }),
    getProcess: () => (opts.cliStartsHere === false ? undefined : {}),
    subscribe: vi.fn(),
    setHeldElsewhere: vi.fn(),
  } as unknown as ConnectionManager;
  const call = (type: string, payload: Record<string, unknown>) => ({ type, payload, requestId: 'r1', timestamp: 0 }) as never;
  return { connections, sent, call };
}
const bridge = {} as Bridge;

describe('takeOverSessionHandler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks the holder to let go, then starts the CLI here, resuming the session', async () => {
    heldBy(entry(true));
    vi.mocked(callHolder).mockResolvedValue({ result: 'forwarded' });
    const { connections, sent, call } = setup({ sessionWorkingDir: '/watch' });
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now' }), connections, bridge);
    expect(callHolder).toHaveBeenCalledWith('s1', { action: 'release', interrupt: true }, expect.any(Number));
    expect(markSessionAsSpawned).toHaveBeenCalledWith('s1');
    expect(ensureClaudeProcess).toHaveBeenCalledWith(connections, 'c1', '/watch', 's1', undefined, bridge, undefined);
    expect(sent).toEqual([{ requestId: 'r1', status: 'ok' }]);
  });

  // A session this backend only watches can carry an empty folder; it must not win over the folder the holder runs it in.
  it('falls back to the holder\'s folder when the folder this backend has for the session is empty', async () => {
    heldBy(entry(true));
    vi.mocked(callHolder).mockResolvedValue({ result: 'forwarded' });
    const { connections, sent, call } = setup({ sessionWorkingDir: '' });
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now' }), connections, bridge);
    expect(ensureClaudeProcess).toHaveBeenCalledWith(connections, 'c1', '/held/folder', 's1', undefined, bridge, undefined);
    expect(sent[0].status).toBe('ok');
  });

  it('does not interrupt when the person chose to wait, and refuses to wait for a holder that waits for an answer', async () => {
    heldBy(entry(true));
    vi.mocked(askHolderActivity).mockResolvedValue({ activity: 'awaiting', turnStartedAt: 5 });
    const { connections, sent, call } = setup();
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'afterTurn' }), connections, bridge);
    expect(sent).toEqual([{ requestId: 'r1', status: 'error', error: 'awaiting' }]);
    expect(callHolder).not.toHaveBeenCalled();
    expect(ensureClaudeProcess).not.toHaveBeenCalled();
  });

  it('stops an older holder, which has no address to ask, through the registry', async () => {
    heldBy(entry(false));
    vi.mocked(callHolder).mockResolvedValue({ result: 'held_but_unreachable' });
    const { connections, sent, call } = setup({ sessionWorkingDir: '/watch' });
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now' }), connections, bridge);
    expect(killRegisteredCli).toHaveBeenCalledTimes(1);
    expect(sent[0].status).toBe('ok');
  });

  it('stops a holder that has an address but does not answer (a hung backend) through the registry too', async () => {
    heldBy(entry(true));
    vi.mocked(callHolder).mockResolvedValue({ result: 'held_but_unreachable' });
    const { connections, sent, call } = setup({ sessionWorkingDir: '/watch' });
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now' }), connections, bridge);
    expect(killRegisteredCli).toHaveBeenCalledTimes(1);
    expect(sent[0].status).toBe('ok');
  });

  // A session that asks before edits must not start to run edits unasked because the backend that took it over has a looser default.
  it('starts the CLI under the permission mode the holder ran under, not the one the tab would have used', async () => {
    heldBy(entry(true));
    vi.mocked(askHolderActivity).mockResolvedValue({ activity: 'idle', turnStartedAt: null, inputMode: 'default' });
    vi.mocked(callHolder).mockResolvedValue({ result: 'forwarded' });
    const { connections, call } = setup({ sessionWorkingDir: '/watch' });
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now', inputMode: 'bypass' }), connections, bridge);
    expect(ensureClaudeProcess).toHaveBeenCalledWith(connections, 'c1', '/watch', 's1', 'default', bridge, undefined);
  });

  it('falls back on the tab\'s mode when the holder is too old to say which mode it runs under', async () => {
    heldBy(entry(false));
    vi.mocked(askHolderActivity).mockResolvedValue({ activity: 'idle' });
    vi.mocked(callHolder).mockResolvedValue({ result: 'held_but_unreachable' });
    const { connections, call } = setup({ sessionWorkingDir: '/watch' });
    await takeOverSessionHandler('c1', call(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now', inputMode: 'plan' }), connections, bridge);
    expect(ensureClaudeProcess).toHaveBeenCalledWith(connections, 'c1', '/watch', 's1', 'plan', bridge, undefined);
  });
});

describe('getSessionHolderHandler', () => {
  beforeEach(() => vi.clearAllMocks());
  const ask = async () => {
    const { connections, sent, call } = setup();
    await getSessionHolderHandler('c1', call(MessageType.GET_SESSION_HOLDER, { sessionId: 's1' }), connections, bridge);
    return sent[0].holder as { activity: string; workingDir: string; ownerPid: number; reachable: boolean } | null;
  };

  it('says there is no other holder when no other backend runs the session', async () => {
    vi.mocked(findLiveCliForSession).mockReturnValue(null);
    expect(await ask()).toBeNull();
  });

  // The activity the holder's screens reported can still say idle while a turn is in flight; the turn wins.
  it('reads a turn in flight as running whatever the screens said, and a waiting holder as awaiting', async () => {
    heldBy(entry(true));
    vi.mocked(askHolderActivity).mockResolvedValue({ activity: 'idle', turnStartedAt: 1000 });
    expect((await ask())?.activity).toBe('running');
    vi.mocked(askHolderActivity).mockResolvedValue({ activity: 'awaiting', turnStartedAt: 1000 });
    expect((await ask())?.activity).toBe('awaiting');
    vi.mocked(askHolderActivity).mockResolvedValue({ activity: 'idle', turnStartedAt: null });
    expect((await ask())?.activity).toBe('idle');
  });

  it('tells the folder and the process of the other backend, and reads one too old to answer as running', async () => {
    heldBy(entry(false));
    vi.mocked(askHolderActivity).mockResolvedValue(undefined);
    expect(await ask()).toEqual({ activity: 'running', workingDir: '/held/folder', ownerPid: OTHER_BACKEND_PID, reachable: false });
  });
});
