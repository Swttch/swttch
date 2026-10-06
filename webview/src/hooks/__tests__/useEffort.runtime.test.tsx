import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ModelInfo } from '@/types/slashCommand';
import { MessageType } from '@/shared';

/**
 * The slider's level is written to the settings file, which a CLI spawned later reads and a
 * running one never does. So a change also has to be told to the CLI that is running now
 * (SET_EFFORT), and after a reply the level the CLI says it ran at is what the slider shows.
 */

const calls: Array<[string, ...unknown[]]> = [];
const updateSetting = vi.fn(async (key: string, value: unknown) => { calls.push(['setting', key, value]); });
const send = vi.fn(async (type: string, payload: unknown) => { calls.push(['send', type, payload]); return { status: 'ok' }; });
const clearAppliedEffort = vi.fn(() => { calls.push(['clearApplied']); });

let settings: Record<string, unknown> = {};
let appliedEffort: string | null = null;

const sonnet = ModelInfo.from({
  value: 'sonnet',
  displayName: 'Sonnet',
  supportsEffort: true,
  supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
});

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings, updateSetting }),
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

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  settings = { effortLevel: 'medium' };
  appliedEffort = null;
  catalog = [sonnet];
});

describe('changing the level', () => {
  it('stores it first, then tells the running CLI, and drops the last reply\'s level before either', async () => {
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('high'); });

    expect(calls).toEqual([
      ['clearApplied'],
      ['setting', 'effortLevel', 'high'],
      ['send', MessageType.SET_EFFORT, { effortLevel: 'high' }],
    ]);
  });

  it('turns ultracode off, in the file and in the running CLI, when a plain level is picked over it', async () => {
    settings = { effortLevel: 'xhigh', ultracode: true };
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('low'); });

    expect(calls).toEqual([
      ['clearApplied'],
      ['setting', 'ultracode', null],
      ['setting', 'effortLevel', 'low'],
      ['send', MessageType.SET_EFFORT, { effortLevel: 'low', ultracode: false }],
    ]);
  });

  it('stores auto as null and tells the CLI to drop its override', async () => {
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.setLevel('auto'); });

    expect(calls).toContainEqual(['setting', 'effortLevel', null]);
    expect(calls).toContainEqual(['send', MessageType.SET_EFFORT, { effortLevel: null }]);
  });

  it('engages ultracode as its xhigh floor plus the flag', async () => {
    const { result } = renderHook(() => useEffort());
    await act(async () => { await result.current.enableUltracode(); });

    expect(calls).toEqual([
      ['clearApplied'],
      ['setting', 'effortLevel', 'xhigh'],
      ['setting', 'ultracode', true],
      ['send', MessageType.SET_EFFORT, { effortLevel: 'xhigh', ultracode: true }],
    ]);
  });

  it('is not undone by a running CLI that cannot be told: the level stays stored and nothing is thrown', async () => {
    send.mockRejectedValueOnce(new Error('socket closed'));
    const { result } = renderHook(() => useEffort());

    await expect(act(async () => { await result.current.setLevel('high'); })).resolves.not.toThrow();
    expect(calls).toContainEqual(['setting', 'effortLevel', 'high']);
  });

  it('does nothing, and tells no CLI, when the model has no effort levels', async () => {
    catalog = [ModelInfo.from({ value: 'sonnet', displayName: 'Sonnet', supportsEffort: false })];
    const { result } = renderHook(() => useEffort());
    expect(result.current.supportsEffort).toBe(false);

    await act(async () => { await result.current.setLevel('high'); });

    expect(calls).toEqual([]);
  });
});

describe('what the slider shows after a reply', () => {
  it('shows the stored level when no reply has reported one', () => {
    const { result } = renderHook(() => useEffort());
    expect(result.current.current).toBe('medium');
  });

  it('shows the level the reply ran at, ahead of the stored one', () => {
    appliedEffort = 'low';
    settings = { effortLevel: 'high' };
    const { result } = renderHook(() => useEffort());
    expect(result.current.current).toBe('low');
    expect(result.current.def.label).toBe('Low');
  });

  it('shows ultracode only while the reply really ran at its xhigh floor', () => {
    settings = { effortLevel: 'xhigh', ultracode: true };

    appliedEffort = null;
    expect(renderHook(() => useEffort()).result.current.ultracodeEnabled).toBe(true);

    appliedEffort = 'xhigh';
    expect(renderHook(() => useEffort()).result.current.ultracodeEnabled).toBe(true);

    appliedEffort = 'high';
    expect(renderHook(() => useEffort()).result.current.ultracodeEnabled).toBe(false);
  });

  it('steps on from the level the reply ran at, not from the stored one', async () => {
    appliedEffort = 'low';
    settings = { effortLevel: 'max' };
    const { result } = renderHook(() => useEffort());
    await act(async () => { result.current.cycle(); });

    expect(calls).toContainEqual(['setting', 'effortLevel', 'medium']);
  });
});
