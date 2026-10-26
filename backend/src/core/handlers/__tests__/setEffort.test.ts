import { describe, it, expect, vi, beforeEach } from 'vitest';

const applyEffortToLiveCli = vi.fn<(...args: unknown[]) => Promise<string>>();
const saveModelEffortLevel = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const readMergedClaudeSettings = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const saveClaudeSetting = vi.fn<(...args: unknown[]) => Promise<unknown>>();

vi.mock('../../features/effort-runtime', () => ({
  applyEffortToLiveCli: (...args: unknown[]) => applyEffortToLiveCli(...args),
}));
vi.mock('../../features/model-effort-setting', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../features/model-effort-setting')>()),
  saveModelEffortLevel: (...args: unknown[]) => saveModelEffortLevel(...args),
}));
vi.mock('../../features/claude-settings', () => ({
  readMergedClaudeSettings: (...args: unknown[]) => readMergedClaudeSettings(...args),
  saveClaudeSetting: (...args: unknown[]) => saveClaudeSetting(...args),
}));

import { setEffortHandler } from '../setEffort';
import { MessageType } from '../../../shared';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';

function connectionsFor(sessionId: string | undefined) {
  const sendTo = vi.fn();
  const broadcastToAll = vi.fn();
  const setEffortPick = vi.fn();
  const setPendingEffortPick = vi.fn();
  const connections = {
    sendTo,
    broadcastToAll,
    setEffortPick,
    setPendingEffortPick,
    getClient: () => ({ subscribedSessionId: sessionId }),
    getSession: () => ({ workingDir: '/work' }),
  } as unknown as ConnectionManager;
  return { connections, sendTo, broadcastToAll, setEffortPick, setPendingEffortPick };
}

const message = (payload: Record<string, unknown> | undefined): IPCMessage =>
  ({ type: MessageType.SET_EFFORT, requestId: 'r1', payload }) as unknown as IPCMessage;

const SONNET = 'claude-sonnet-5-5';

beforeEach(() => {
  vi.clearAllMocks();
  applyEffortToLiveCli.mockResolvedValue('control_request');
  saveModelEffortLevel.mockResolvedValue({ status: 'ok', persisted: true });
  readMergedClaudeSettings.mockResolvedValue({ settings: { model: 'sonnet' }, overrides: [], unreadable: [] });
  saveClaudeSetting.mockResolvedValue({ status: 'ok' });
});

describe('setEffortHandler', () => {
  it('stores the level for the model, remembers it for the session, and tells the live CLI', async () => {
    const { connections, sendTo, setEffortPick } = connectionsFor('s1');

    await setEffortHandler('c1', message({ effortLevel: 'high', ultracode: false, model: SONNET }), connections, {} as Bridge);

    expect(saveModelEffortLevel).toHaveBeenCalledWith(SONNET, 'high');
    expect(setEffortPick).toHaveBeenCalledWith('s1', 'high');
    expect(applyEffortToLiveCli).toHaveBeenCalledWith(connections, 's1', { effortLevel: 'high', ultracode: false });
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'r1', status: 'ok', via: 'control_request', persisted: true,
    });
  });

  it('tells every window the settings changed, so each slider reads the stored level', async () => {
    const { connections, broadcastToAll } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: 'low', model: SONNET }), connections, {} as Bridge);

    expect(readMergedClaudeSettings).toHaveBeenCalledWith('/work');
    expect(broadcastToAll).toHaveBeenCalledWith(MessageType.CLAUDE_SETTINGS_CHANGED, {
      settings: { model: 'sonnet' }, overrides: [], unreadable: [],
    });
  });

  it('drops the stored level and the session pick for Auto (null), which is not the same as no change', async () => {
    const { connections, setEffortPick } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: null, model: SONNET }), connections, {} as Bridge);

    expect(saveModelEffortLevel).toHaveBeenCalledWith(SONNET, null);
    expect(setEffortPick).toHaveBeenCalledWith('s1', null);
    expect(applyEffortToLiveCli).toHaveBeenCalledWith(connections, 's1', { effortLevel: null });
  });

  // The slider used to write null into the top-level key for Auto. Left there it would come back as the
  // legacy `--effort` at the next spawn, and Auto would not be Auto.
  // The top-level level reached every model as a flag until the first per-model level exists, and the CLI
  // ignores it (measured on 2.1.310 for Sonnet and Opus). Picking one model must not drop the others.
  describe('the first per-model level of a user who only has the old top-level one', () => {
    const OPUS = 'claude-opus-5-5';
    const HAIKU = 'claude-haiku-5-5';

    beforeEach(() => {
      readMergedClaudeSettings.mockResolvedValue({ settings: { effortLevel: 'high' }, overrides: [], unreadable: [] });
    });

    it('writes the old level into every other model the slider named, after the pick itself', async () => {
      const { connections } = connectionsFor('s1');
      await setEffortHandler('c1', message({ effortLevel: 'low', model: SONNET, inheritLegacy: [OPUS, HAIKU] }), connections, {} as Bridge);

      expect(saveModelEffortLevel.mock.calls).toEqual([[SONNET, 'low'], [OPUS, 'high'], [HAIKU, 'high']]);
    });

    it('does nothing for a user who already has a per-model level, whose top-level value no longer reaches anyone', async () => {
      readMergedClaudeSettings.mockResolvedValue({
        settings: { effortLevel: 'high', modelSettings: { [OPUS]: { effortLevel: 'low' } } }, overrides: [], unreadable: [],
      });
      const { connections } = connectionsFor('s1');
      await setEffortHandler('c1', message({ effortLevel: 'low', model: SONNET, inheritLegacy: [OPUS] }), connections, {} as Bridge);
      expect(saveModelEffortLevel.mock.calls).toEqual([[SONNET, 'low']]);
    });

    it('does nothing for Auto, for a pick that is not stored, or when the old level is max, which the file cannot hold', async () => {
      const auto = connectionsFor('s1');
      await setEffortHandler('c1', message({ effortLevel: null, model: SONNET, inheritLegacy: [OPUS] }), auto.connections, {} as Bridge);
      expect(saveModelEffortLevel.mock.calls).toEqual([[SONNET, null]]);

      saveModelEffortLevel.mockClear();
      saveModelEffortLevel.mockResolvedValue({ status: 'ok', persisted: false });
      const unstored = connectionsFor('s1');
      await setEffortHandler('c1', message({ effortLevel: 'low', model: null, inheritLegacy: [OPUS] }), unstored.connections, {} as Bridge);
      expect(saveModelEffortLevel.mock.calls).toEqual([[null, 'low']]);

      saveModelEffortLevel.mockClear();
      saveModelEffortLevel.mockResolvedValue({ status: 'ok', persisted: true });
      readMergedClaudeSettings.mockResolvedValue({ settings: { effortLevel: 'max' }, overrides: [], unreadable: [] });
      const max = connectionsFor('s1');
      await setEffortHandler('c1', message({ effortLevel: 'low', model: SONNET, inheritLegacy: [OPUS] }), max.connections, {} as Bridge);
      expect(saveModelEffortLevel.mock.calls).toEqual([[SONNET, 'low']]);
    });

    it('accepts canonical model names only, never the picked model twice, and never more than 32', async () => {
      const many = Array.from({ length: 40 }, (_, i) => `claude-model-${i}`);
      const { connections } = connectionsFor('s1');
      await setEffortHandler(
        'c1',
        message({ effortLevel: 'low', model: SONNET, inheritLegacy: [SONNET, 'opus', 42, 'claude-x; rm', ...many] }),
        connections,
        {} as Bridge,
      );
      const written = saveModelEffortLevel.mock.calls.map(([name]) => name);
      expect(written[0]).toBe(SONNET);
      expect(written.slice(1)).toEqual(many.slice(0, 32));
    });

    it('stops and reports when one of the others cannot be written', async () => {
      saveModelEffortLevel.mockResolvedValueOnce({ status: 'ok', persisted: true });
      saveModelEffortLevel.mockResolvedValueOnce({ status: 'error', error: 'settings.json could not be written' });
      const { connections, sendTo } = connectionsFor('s1');
      await setEffortHandler('c1', message({ effortLevel: 'low', model: SONNET, inheritLegacy: [OPUS, HAIKU] }), connections, {} as Bridge);

      expect(saveModelEffortLevel).toHaveBeenCalledTimes(2);
      expect(applyEffortToLiveCli).not.toHaveBeenCalled();
      expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'error' }));
    });
  });

  it('retires the top-level effortLevel for Auto, as the slider always did, and for no other pick', async () => {
    const auto = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: null, model: SONNET }), auto.connections, {} as Bridge);
    expect(saveClaudeSetting).toHaveBeenCalledWith('effortLevel', null);

    saveClaudeSetting.mockClear();
    const high = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: 'high', model: SONNET }), high.connections, {} as Bridge);
    expect(saveClaudeSetting).not.toHaveBeenCalled();
  });

  it('retires the top-level effortLevel for Auto even when the model is an alias with no entry of its own', async () => {
    saveModelEffortLevel.mockResolvedValue({ status: 'ok', persisted: false });
    const { connections, sendTo } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: null, model: null }), connections, {} as Bridge);

    expect(saveClaudeSetting).toHaveBeenCalledWith('effortLevel', null);
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'ok', persisted: true }));
  });

  it('reports a refusal to retire the top-level key instead of pretending Auto went through', async () => {
    saveClaudeSetting.mockResolvedValue({ status: 'error', error: 'settings.json is held open by another program' });
    const { connections, sendTo, setEffortPick } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: null, model: SONNET }), connections, {} as Bridge);

    expect(setEffortPick).not.toHaveBeenCalledWith('s1', null);
    expect(applyEffortToLiveCli).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({
      status: 'error', error: 'settings.json is held open by another program',
    }));
  });

  it('keeps a pick that cannot be stored (max, or a model the catalog cannot name) for the session, and says so', async () => {
    saveModelEffortLevel.mockResolvedValue({ status: 'ok', persisted: false });
    const { connections, sendTo, setEffortPick, broadcastToAll } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: 'max', model: SONNET }), connections, {} as Bridge);

    expect(setEffortPick).toHaveBeenCalledWith('s1', 'max');
    expect(applyEffortToLiveCli).toHaveBeenCalled();
    expect(broadcastToAll).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ status: 'ok', persisted: false }));
  });

  it('applies nothing and remembers nothing when the file refuses the write, and reports why', async () => {
    saveModelEffortLevel.mockResolvedValue({ status: 'error', error: 'settings.json exists but could not be read' });
    const { connections, sendTo, setEffortPick } = connectionsFor('s1');
    await setEffortHandler('c1', message({ effortLevel: 'high', model: SONNET }), connections, {} as Bridge);

    expect(setEffortPick).not.toHaveBeenCalled();
    expect(applyEffortToLiveCli).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'r1', status: 'error', error: 'settings.json exists but could not be read',
    });
  });

  it('stores nothing for a change that only touches ultracode', async () => {
    const { connections, setEffortPick } = connectionsFor('s1');
    await setEffortHandler('c1', message({ ultracode: false }), connections, {} as Bridge);

    expect(saveModelEffortLevel).not.toHaveBeenCalled();
    expect(setEffortPick).not.toHaveBeenCalled();
    expect(applyEffortToLiveCli).toHaveBeenCalledWith(connections, 's1', { ultracode: false });
  });

  it('has no CLI to tell in a chat that has not started, but stores the level and holds the pick for the first spawn', async () => {
    const { connections, sendTo, setEffortPick, setPendingEffortPick } = connectionsFor(undefined);
    await setEffortHandler('c1', message({ effortLevel: 'low', model: SONNET }), connections, {} as Bridge);

    expect(saveModelEffortLevel).toHaveBeenCalledWith(SONNET, 'low');
    expect(setEffortPick).not.toHaveBeenCalled();
    expect(setPendingEffortPick).toHaveBeenCalledWith('c1', 'low');
    expect(applyEffortToLiveCli).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, {
      requestId: 'r1', status: 'ok', via: 'not_running', persisted: true,
    });
  });

  it.each([
    ['nothing', undefined],
    ['an empty change', {}],
    ['a level with a shell metacharacter, since the fallback writes it into a command', { effortLevel: 'high; rm -rf ~' }],
    ['a level with a space', { effortLevel: 'very high' }],
    ['a non-boolean ultracode', { ultracode: 'yes' }],
  ])('refuses %s before it can reach the file or the CLI', async (_label, payload) => {
    const { connections, sendTo } = connectionsFor('s1');
    await setEffortHandler('c1', message(payload as Record<string, unknown> | undefined), connections, {} as Bridge);
    expect(saveModelEffortLevel).not.toHaveBeenCalled();
    expect(applyEffortToLiveCli).not.toHaveBeenCalled();
    expect(sendTo).toHaveBeenCalledWith('c1', MessageType.ACK, expect.objectContaining({ requestId: 'r1', status: 'error' }));
  });
});
