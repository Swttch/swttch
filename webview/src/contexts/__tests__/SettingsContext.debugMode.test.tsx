/**
 * The "Debug Mode" setting decides how much of the page's own log is forwarded (issue #723).
 * The effect is the only thing that carries the setting to the log forwarder, so if it stops
 * firing the toggle goes dead with nothing else to catch it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '../SettingsContext';
import { SettingKey } from '@/types/settings';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

const setDebugLogging = vi.fn();

vi.mock('@/api/logging', () => ({
  getLogForwarder: () => ({ setDebugLogging }),
}));

// A never-resolving send() keeps the seeded localStorage value in play instead of letting a
// bridge response overwrite it.
const mockSend = vi.fn(() => new Promise(() => { /* never resolves */ }));
const mockSubscribe = vi.fn(() => () => { /* unsubscribe noop */ });

vi.mock('../BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: false,
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

const STORAGE_KEY = 'claude-code-settings';

function renderWithDebugMode(debugMode?: boolean) {
  if (debugMode !== undefined) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ [SettingKey.DEBUG_MODE]: debugMode }));
  }
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SettingsProvider>
        <div data-testid="child">child</div>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SettingsContext — Debug Mode reaches the log forwarder (#723)', () => {
  it('turns debug forwarding on when the setting is on', async () => {
    renderWithDebugMode(true);
    await waitFor(() => {
      expect(setDebugLogging).toHaveBeenCalledWith(true);
    });
  });

  it('keeps debug forwarding off when the setting is off', async () => {
    renderWithDebugMode(false);
    await waitFor(() => {
      expect(setDebugLogging).toHaveBeenCalled();
    });
    expect(setDebugLogging).not.toHaveBeenCalledWith(true);
  });

  it('defaults to off', async () => {
    renderWithDebugMode();
    await waitFor(() => {
      expect(setDebugLogging).toHaveBeenCalledWith(false);
    });
  });
});
