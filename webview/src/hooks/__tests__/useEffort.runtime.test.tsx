import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ModelInfo } from '@/types/slashCommand';
import { MessageType } from '@/shared';

/**
 * The slider's level belongs to the model: the backend stores it as `modelSettings.<model>.effortLevel`,
 * remembers it for the session, and tells the CLI that is running now (SET_EFFORT). The webview only sends
 * the pick, with the model it was picked for, and shows what is stored for the model, or what the last
 * reply ran at once there is a reply (#604).
 */

const calls: Array<[string, ...unknown[]]> = [];
const updateSetting = vi.fn(async (key: string, value: unknown) => { calls.push(['setting', key, value]); });
const send = vi.fn(async (type: string, payload: unknown): Promise<{ status: string; error?: string }> => {
  calls.push(['send', type, payload]);
  return { status: 'ok' };
});
const clearAppliedEffort = vi.fn(() => { calls.push(['clearApplied']); });

let settings: Record<string, unknown> = {};
let appliedEffort: string | null = null;

const sonnet = ModelInfo.from({
  value: 'sonnet',
  displayName: 'Sonnet',
  resolvedModel: 'claude-sonnet-5-5',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
});

const reportSaveError = vi.fn();
const clearSaveError = vi.fn();

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings, updateSetting, reportSaveError, clearSaveError }),
}));
let catalog: ModelInfo[] = [sonnet];

vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: { response: { response: { models: catalog } } } }),
}));
vi.mock('@/hooks/useCurrentModel', () => ({ useCurrentModel: () => 'sonnet' }));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ appliedEffort, clearAppliedEffort }),
}));
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send }) }));

import { useEffort } from '../useEffort';

const SONNET = 'claude-sonnet-5-5';

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  settings = { modelSettings: { [SONNET]: { effortLevel: 'medium' } } };
  appliedEffort = null;
  catalog = [sonnet];
});

describe('changing the level', () => {
  it('sends the pick with its model to the backend, and writes no effort key itself', async () => {
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('high'); });

    expect(calls).toEqual([
      ['clearApplied'],
      ['send', MessageType.SET_EFFORT, { effortLevel: 'high', model: SONNET }],
    ]);
  });

  it('turns ultracode off, in the file and in the running CLI, when a plain level is picked over it', async () => {
    settings = { modelSettings: { [SONNET]: { effortLevel: 'xhigh' } }, ultracode: true };
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('low'); });

    expect(calls).toEqual([
      ['clearApplied'],
      ['setting', 'ultracode', null],
      ['send', MessageType.SET_EFFORT, { effortLevel: 'low', ultracode: false, model: SONNET }],
    ]);
  });

  it('sends auto as null, which drops the stored level of the model', async () => {
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('auto'); });

    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: null, model: SONNET }]);
    expect(calls.some(([kind, key]) => kind === 'setting' && key === 'effortLevel')).toBe(false);
  });

  it('engages ultracode as its xhigh floor plus the flag', async () => {
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.enableUltracode(); });

    expect(calls).toEqual([
      ['clearApplied'],
      ['setting', 'ultracode', true],
      ['send', MessageType.SET_EFFORT, { effortLevel: 'xhigh', ultracode: true, model: SONNET }],
    ]);
  });

  it('rejects when the backend refuses to store the level, so the caller knows the slider did not move', async () => {
    send.mockResolvedValueOnce({ status: 'error', error: 'settings.json exists but could not be read' });
    const { result } = renderHook(() => useEffort());

    await expect(act(async () => { await result.current.setLevel('high'); })).rejects.toThrow('could not be read');
  });

  // #595: a refused save says why on the settings-file banner. The slider's save goes through the backend
  // and not through updateSetting, so it has to reach the same banner itself.
  it('puts the reason of a refused save on the settings-file banner, and takes it down after a save that goes through', async () => {
    send.mockResolvedValueOnce({ status: 'error', error: 'settings.json exists but could not be read' });
    const { result } = renderHook(() => useEffort());
    await expect(act(async () => { await result.current.setLevel('high'); })).rejects.toThrow();
    expect(reportSaveError).toHaveBeenCalledTimes(1);
    expect((reportSaveError.mock.calls[0][0] as Error).message).toBe('settings.json exists but could not be read');

    await act(async () => { await result.current.setLevel('low'); });
    expect(clearSaveError).toHaveBeenCalled();
  });

  it('reports a socket that closed on the way, too', async () => {
    send.mockRejectedValueOnce(new Error('socket closed'));
    const { result } = renderHook(() => useEffort());
    await expect(act(async () => { await result.current.setLevel('high'); })).rejects.toThrow('socket closed');
    expect(reportSaveError).toHaveBeenCalledTimes(1);
  });

  it('sends the model as null when the catalog cannot say which concrete model the picker shows', async () => {
    catalog = [ModelInfo.from({
      value: 'sonnet',
      displayName: 'Sonnet',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high'],
    })];
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('high'); });

    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: 'high', model: null }]);
  });

  it('does nothing, and tells no CLI, when the model has no effort levels', async () => {
    catalog = [ModelInfo.from({ value: 'sonnet', displayName: 'Sonnet', supportsEffort: false })];
    const { result } = renderHook(() => useEffort());
    expect(result.current.supportsEffort).toBe(false);

    await act(async () => { await result.current.setLevel('high'); });

    expect(calls).toEqual([]);
  });
});

describe('what the slider shows', () => {
  it("shows the stored level of the current model when no reply has reported one", () => {
    const { result } = renderHook(() => useEffort());
    expect(result.current.current).toBe('medium');
  });

  it("shows Auto for a model with no level of its own once any other model has one, whatever the top-level effortLevel says", () => {
    // That user works per model: the backend no longer passes the top-level value as a flag, and the CLI
    // takes it for some models only, so it is not a level this model is known to run at.
    settings = { effortLevel: 'high', modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } };
    const { result } = renderHook(() => useEffort());
    expect(result.current.current).toBe('auto');
    expect(result.current.def.label).toBe('Auto');
  });

  // The regression guard for everyone who upgrades: every older slider wrote only this key, and every spawn
  // passed it as `--effort`, so it is what their sessions run at. The slider keeps saying so.
  it("keeps showing the top-level effortLevel of a user who has no per-model level anywhere", () => {
    settings = { effortLevel: 'high' };
    const { result } = renderHook(() => useEffort());
    expect(result.current.current).toBe('high');

    settings = { effortLevel: 'high', modelSettings: { [SONNET]: { maxEffortLevel: 'high' } } };
    expect(renderHook(() => useEffort()).result.current.current).toBe('high');
  });

  it('asks the backend to keep the old top-level level for the other models on the first pick, and only then', async () => {
    const opus = ModelInfo.from({
      value: 'opus',
      displayName: 'Opus',
      resolvedModel: 'claude-opus-5-5',
      supportsEffort: true,
      supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    });
    catalog = [sonnet, opus];
    settings = { effortLevel: 'high' };
    const first = renderHook(() => useEffort());
    await act(async () => { await first.result.current.setLevel('low'); });
    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: 'low', model: SONNET, inheritLegacy: ['claude-opus-5-5'] }]);

    calls.length = 0;
    settings = { effortLevel: 'high', modelSettings: { [SONNET]: { effortLevel: 'low' } } };
    const second = renderHook(() => useEffort());
    await act(async () => { await second.result.current.setLevel('medium'); });
    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: 'medium', model: SONNET }]);

    calls.length = 0;
    settings = { effortLevel: 'high' };
    const auto = renderHook(() => useEffort());
    await act(async () => { await auto.result.current.setLevel('auto'); });
    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: null, model: SONNET }]);
  });

  it("shows the model's own level over the top-level one", () => {
    settings = { effortLevel: 'high', modelSettings: { [SONNET]: { effortLevel: 'low' } } };
    expect(renderHook(() => useEffort()).result.current.current).toBe('low');
  });

  it("finds the model's entry under a dated or [1m] spelling of its key", () => {
    settings = { modelSettings: { 'claude-sonnet-5-5-20260601': { effortLevel: 'high' } } };
    expect(renderHook(() => useEffort()).result.current.current).toBe('high');
    settings = { modelSettings: { 'claude-sonnet-5-5[1m]': { effortLevel: 'low' } } };
    expect(renderHook(() => useEffort()).result.current.current).toBe('low');
  });

  it('shows the level the reply ran at, ahead of the stored one', () => {
    appliedEffort = 'low';
    settings = { modelSettings: { [SONNET]: { effortLevel: 'high' } } };
    const { result } = renderHook(() => useEffort());
    expect(result.current.current).toBe('low');
    expect(result.current.def.label).toBe('Low');
  });

  it('shows ultracode only while the reply really ran at its xhigh floor', () => {
    settings = { modelSettings: { [SONNET]: { effortLevel: 'xhigh' } }, ultracode: true };

    appliedEffort = null;
    expect(renderHook(() => useEffort()).result.current.ultracodeEnabled).toBe(true);

    appliedEffort = 'xhigh';
    expect(renderHook(() => useEffort()).result.current.ultracodeEnabled).toBe(true);

    appliedEffort = 'high';
    expect(renderHook(() => useEffort()).result.current.ultracodeEnabled).toBe(false);
  });

  it('steps on from the level the reply ran at, not from the stored one', async () => {
    appliedEffort = 'low';
    settings = { modelSettings: { [SONNET]: { effortLevel: 'max' } } };
    const { result } = renderHook(() => useEffort());
    await act(async () => { result.current.cycle(); });

    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: 'medium', model: SONNET }]);
  });
});
