/**
 * A SETTINGS_CHANGED push from the backend must reach an already-mounted settings
 * screen in another tab, not just the tab that saved the change.
 *
 * The merged cache is patched in place by the subscription handler, but most rows
 * in the settings screen read from `scopeSettings` (the per-scope query), which
 * has no such patch. The handler instead invalidates every GET_SETTINGS variant
 * so the scope query re-fetches and the mounted screen picks up the new value.
 * Invalidating with `refetchType: 'none'` only marks the query stale without
 * scheduling that re-fetch, so a screen that is already on screen never sees it —
 * it would take an unmount/remount (a "next access") to notice, which never
 * happens for an open tab.
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
 * A bridge whose scope read answers with whatever `scopeValue` currently holds,
 * so a re-fetch after the value is bumped proves the query actually went back
 * out over the bridge instead of replaying a cached response.
 */
function mockBridge(getScopeValue: () => string) {
  mockSend.mockImplementation((type: string, payload?: Record<string, unknown>) => {
    if (type === MessageType.GET_SETTINGS) {
      const value = getScopeValue();
      if (payload?.scope) {
        return Promise.resolve({ settings: { [SettingKey.UI_LANGUAGE]: value } });
      }
      return Promise.resolve({ settings: { [SettingKey.UI_LANGUAGE]: value }, overrides: [] });
    }
    return Promise.resolve({});
  });
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

describe('SettingsContext — SETTINGS_CHANGED reaches an already-mounted screen', () => {
  it('re-fetches the scope query so scopeSettings shows the new value without a remount', async () => {
    let scopeValue = 'before';
    mockBridge(() => scopeValue);
    renderProvider();

    await waitFor(() => {
      expect(captured?.scopeSettings[SettingKey.UI_LANGUAGE]).toBe('before');
    });

    const sendCallsBeforePush = mockSend.mock.calls.filter(
      ([type, payload]) => type === MessageType.GET_SETTINGS && (payload as Record<string, unknown> | undefined)?.scope,
    ).length;

    // The backend's storage changed (another tab saved a new value) and pushed
    // SETTINGS_CHANGED. The scope query must go back out over the bridge to pick
    // this up — the merged payload alone does not carry per-scope truth.
    scopeValue = 'after';
    expect(settingsChangedHandler).toBeDefined();
    await act(async () => {
      settingsChangedHandler!({
        payload: { settings: { [SettingKey.UI_LANGUAGE]: 'merged-after' }, overrides: [] },
      });
    });

    await waitFor(() => {
      expect(captured?.scopeSettings[SettingKey.UI_LANGUAGE]).toBe('after');
    });

    const sendCallsAfterPush = mockSend.mock.calls.filter(
      ([type, payload]) => type === MessageType.GET_SETTINGS && (payload as Record<string, unknown> | undefined)?.scope,
    ).length;

    // A genuine re-fetch happened — not just a cache read of the same response.
    expect(sendCallsAfterPush).toBeGreaterThan(sendCallsBeforePush);
  });
});
