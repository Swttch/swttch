/**
 * Saving a key at global scope while the project overrides that same key must not
 * change what the UI shows (issue #344).
 *
 * The merged cache is what the whole app reads, so an optimistic write into it is
 * a claim that the effective value changed. When the project overrides the key
 * that claim is false: the project value still wins, and the screen goes back on
 * the next reload — which reads as "the setting is not being saved".
 *
 * `overrides` already arrives with the merged settings and says exactly which keys
 * the project has taken over, so the claim can be checked before it is made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider, useSettings } from '../SettingsContext';
import { SettingKey } from '@/types/settings';
import { MessageType } from '@/shared';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

const mockSend = vi.fn();
const mockSubscribe = vi.fn(() => () => { /* unsubscribe noop */ });

vi.mock('../BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: mockSend,
    subscribe: mockSubscribe,
  }),
}));

vi.mock('../WorkingDirContext', () => ({
  useWorkingDir: () => ({
    workingDirectory: '/test/workspace',
    setWorkingDirectory: vi.fn(),
  }),
}));

/** The reproduction from the issue: the project pins 'korean', the global is 'english'. */
const PROJECT_OVERRIDES = { global: 'english', project: 'korean' };

/** The same setup with nothing overridden — the global value is the effective one. */
const NO_OVERRIDE = { global: 'english' };

let captured: ReturnType<typeof useSettings> | null = null;

function Probe() {
  captured = useSettings();
  return <div data-testid="child">child</div>;
}

/**
 * A bridge that resolves scopes the way the backend does, so a save is followed by
 * a merged read that reflects it. Without that the refetch after every save would
 * replay the original payload and revert any optimistic write — which would make
 * this suite pass for the wrong reason.
 */
function mockBridge(
  initial: { global: string; project?: string },
  opts: { onSave?: () => Promise<void> } = {},
) {
  const stored = { ...initial };
  const merged = () => ({
    settings: { [SettingKey.UI_LANGUAGE]: stored.project ?? stored.global },
    overrides: stored.project === undefined ? [] : [SettingKey.UI_LANGUAGE as string],
  });

  mockSend.mockImplementation((type: string, payload?: Record<string, unknown>) => {
    if (type === MessageType.GET_SETTINGS) {
      // A scope read answers with what that scope alone has stored; only the
      // merged read carries `overrides`.
      if (payload?.scope === 'global') return Promise.resolve({ settings: { [SettingKey.UI_LANGUAGE]: stored.global } });
      if (payload?.scope === 'project') {
        return Promise.resolve({ settings: stored.project === undefined ? {} : { [SettingKey.UI_LANGUAGE]: stored.project } });
      }
      return Promise.resolve(merged());
    }
    if (type === MessageType.SAVE_SETTINGS) {
      const scope = payload?.scope as 'global' | 'project';
      const value = payload?.value as string | null;
      const commit = () => {
        if (scope === 'project') {
          if (value === null) delete stored.project;
          else stored.project = value;
        } else {
          stored.global = value as string;
        }
        return { status: 'ok' };
      };
      return opts.onSave ? opts.onSave().then(commit) : Promise.resolve(commit());
    }
    return Promise.resolve({});
  });
  return { merged };
}

function renderProvider() {
  const client = createTestQueryClient();
  render(
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <Probe />
      </SettingsProvider>
    </QueryClientProvider>,
  );
  // The merged cache entry, read straight from the client. This is the value the
  // whole app renders from, and asserting on it catches the optimistic write the
  // moment it lands — before any refetch has had a chance to correct it.
  const mergedCache = () =>
    client.getQueryData<{ settings?: Record<string, unknown> }>([
      MessageType.GET_SETTINGS,
      'merged',
      '/test/workspace',
    ]);
  return { uiLanguage: () => mergedCache()?.settings?.[SettingKey.UI_LANGUAGE] };
}

beforeEach(() => {
  vi.clearAllMocks();
  captured = null;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe('SettingsContext — saving a key the project overrides', () => {
  it('never shows the global value, not even for the moment before the save returns', async () => {
    // Hold the save open so the optimistic write is the only thing on screen.
    // Asserting on the settled value instead would pass against the broken code:
    // the refetch that follows a save corrects the merged cache, so the wrong
    // value is only visible in between — which is exactly the window the user sees.
    let releaseSave: () => void = () => {};
    const savePending = new Promise<void>((resolve) => { releaseSave = resolve; });
    mockBridge(PROJECT_OVERRIDES, { onSave: () => savePending });
    const { uiLanguage } = renderProvider();

    await waitFor(() => {
      expect(uiLanguage()).toBe('korean');
    });

    let saving: Promise<void>;
    await act(async () => {
      saving = captured!.updateSettingWithScope(SettingKey.UI_LANGUAGE, 'japanese', 'global');
      await Promise.resolve();
    });

    // The project value still wins, so nothing reading the settings may see 'japanese'.
    expect(uiLanguage()).toBe('korean');
    expect(mockSend).toHaveBeenCalledWith(
      MessageType.SAVE_SETTINGS,
      expect.objectContaining({ key: SettingKey.UI_LANGUAGE, value: 'japanese', scope: 'global' }),
    );

    await act(async () => {
      releaseSave();
      await saving!;
    });

    // ...and it is still 'korean' once everything has settled.
    await waitFor(() => {
      expect(uiLanguage()).toBe('korean');
    });
  });

  it('applies the new value immediately when the project does not override the key', async () => {
    let releaseSave: () => void = () => {};
    const savePending = new Promise<void>((resolve) => { releaseSave = resolve; });
    mockBridge(NO_OVERRIDE, { onSave: () => savePending });
    const { uiLanguage } = renderProvider();

    await waitFor(() => {
      expect(uiLanguage()).toBe('english');
    });

    let saving: Promise<void>;
    await act(async () => {
      saving = captured!.updateSettingWithScope(SettingKey.UI_LANGUAGE, 'japanese', 'global');
      await Promise.resolve();
    });

    // Nothing overrides the key, so the global value IS the effective one and the
    // screen should show it right away rather than waiting for the round trip.
    expect(uiLanguage()).toBe('japanese');

    await act(async () => {
      releaseSave();
      await saving!;
    });

    await waitFor(() => {
      expect(uiLanguage()).toBe('japanese');
    });
  });

  it('applies the new value when the overriding scope itself is the one being saved', async () => {
    let releaseSave: () => void = () => {};
    const savePending = new Promise<void>((resolve) => { releaseSave = resolve; });
    mockBridge(PROJECT_OVERRIDES, { onSave: () => savePending });
    const { uiLanguage } = renderProvider();

    await waitFor(() => {
      expect(uiLanguage()).toBe('korean');
    });

    let saving: Promise<void>;
    await act(async () => {
      saving = captured!.updateSettingWithScope(SettingKey.UI_LANGUAGE, 'japanese', 'project');
      await Promise.resolve();
    });

    // Writing to the scope that owns the value does change the effective value.
    expect(uiLanguage()).toBe('japanese');

    await act(async () => {
      releaseSave();
      await saving!;
    });

    await waitFor(() => {
      expect(uiLanguage()).toBe('japanese');
    });
  });

  it('exposes the overridden keys so the screen can say the project took the key over', async () => {
    mockBridge(PROJECT_OVERRIDES);
    renderProvider();

    await waitFor(() => {
      expect(captured?.overrides).toContain(SettingKey.UI_LANGUAGE);
    });
  });
});
