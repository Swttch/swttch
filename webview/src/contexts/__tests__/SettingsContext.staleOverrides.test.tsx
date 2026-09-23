/**
 * A single settings save can trigger two SETTINGS_CHANGED pushes: the save
 * handler's own push (correct, computed with the saving tab's workingDir) and a
 * second push ~300ms later from the settings file watcher
 * (backend/src/core/features/settings-watcher.ts), which recomputes the merged
 * settings without a workingDir and so sends global-only settings with an empty
 * `overrides` array.
 *
 * `overrides` is what tells the settings screen which keys the project has
 * taken over (the "P" badge and the greyed-out row). Writing that pushed
 * payload straight into the merged cache used to make the marker disappear the
 * instant the push landed — before the corrective re-fetch even went out —
 * reproducing the flash issue #344 fixed through a different door.
 *
 * The re-fetch triggered by the push is deliberately held open in this test so
 * the moment right after the push, and before any round trip has answered, is
 * observable: that is exactly the window the old code got wrong by writing the
 * payload into the cache synchronously.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider, useSettings } from '../SettingsContext';
import { SettingKey } from '@/types/settings';
import { MessageType } from '@/shared';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

type SettingsChangedHandler = (message: { payload: unknown }) => void;

const mockSend = vi.fn();
let settingsChangedHandler: SettingsChangedHandler | undefined;
const mockSubscribe = vi.fn((type: string, handler: SettingsChangedHandler) => {
  if (type === MessageType.SETTINGS_CHANGED) settingsChangedHandler = handler;
  return () => { /* unsubscribe noop */ };
});

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

let captured: ReturnType<typeof useSettings> | null = null;

function Probe() {
  captured = useSettings();
  return <div data-testid="child">child</div>;
}

/**
 * A bridge whose merged read (no `scope` in the payload) resolves instantly for
 * the initial mount, but returns a promise that stays pending — until the test
 * releases it — for every merged read after that. Scope reads always resolve
 * instantly since this suite does not exercise them.
 *
 * That gap is what lets the assertion land in the window between the push
 * arriving and its corrective re-fetch answering: the only window the pushed
 * payload can be observed in, whether or not the code under test writes it into
 * the cache.
 */
function mockBridge() {
  let mergedCallCount = 0;
  let releaseNextMerged: (() => void) | undefined;

  mockSend.mockImplementation((type: string, payload?: Record<string, unknown>) => {
    if (type === MessageType.GET_SETTINGS) {
      if (payload?.scope) {
        return Promise.resolve({ settings: { [SettingKey.UI_LANGUAGE]: 'korean' } });
      }
      mergedCallCount += 1;
      const answer = {
        settings: { [SettingKey.UI_LANGUAGE]: 'korean' },
        overrides: [SettingKey.UI_LANGUAGE as string],
      };
      if (mergedCallCount === 1) return Promise.resolve(answer);
      return new Promise((resolve) => {
        releaseNextMerged = () => resolve(answer);
      });
    }
    return Promise.resolve({});
  });

  return { releasePendingMerged: () => releaseNextMerged?.() };
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
  const mergedCache = () =>
    client.getQueryData<{ overrides?: string[] }>([
      MessageType.GET_SETTINGS,
      'merged',
      '/test/workspace',
    ]);
  return { overrides: () => mergedCache()?.overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  captured = null;
  settingsChangedHandler = undefined;
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

describe('SettingsContext — SETTINGS_CHANGED with stale, workingDir-less overrides', () => {
  it('does not blank the project override before the corrective re-fetch answers', async () => {
    const { releasePendingMerged } = mockBridge();
    const { overrides: cacheOverrides } = renderProvider();

    await waitFor(() => {
      expect(captured?.overrides).toContain(SettingKey.UI_LANGUAGE);
    });

    // The settings file watcher's push: computed without a workingDir, so it
    // carries global-only settings and an empty overrides array. The re-fetch
    // this triggers is held pending (see mockBridge), so this is the only
    // moment the pushed payload could leak into what the consumer reads.
    expect(settingsChangedHandler).toBeDefined();
    await act(async () => {
      settingsChangedHandler!({
        payload: { settings: { [SettingKey.UI_LANGUAGE]: 'english' }, overrides: [] },
      });
    });

    // The re-fetch has not answered yet, so nothing but the backend's own
    // answer may decide what `overrides` is here. The project override must
    // still be visible.
    expect(cacheOverrides()).toContain(SettingKey.UI_LANGUAGE);

    // Let the corrective re-fetch answer and confirm the settled state agrees.
    await act(async () => {
      releasePendingMerged();
    });
    await waitFor(() => {
      expect(captured?.overrides).toContain(SettingKey.UI_LANGUAGE);
    });
  });
});
