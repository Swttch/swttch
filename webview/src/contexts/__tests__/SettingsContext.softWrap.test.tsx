/**
 * The soft-wrap setting (issue #179) reaches the transcript through a single
 * class on <html>, which the CSS in index.css keys off. That class is the whole
 * mechanism: the monospace blocks live in a dozen components and none of them
 * read the setting, so if this effect stops firing the toggle goes dead with
 * nothing else to catch it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '../SettingsContext';
import { SettingKey } from '@/types/settings';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

// A never-resolving send() keeps the seeded localStorage value in play instead
// of letting a bridge response overwrite it.
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

function renderWithSoftWrap(softWrap?: boolean) {
  if (softWrap !== undefined) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ [SettingKey.SOFT_WRAP]: softWrap }),
      );
    } catch {
      // ignore
    }
  }
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <div data-testid="child">child</div>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  document.documentElement.classList.remove('soft-wrap');
});

afterEach(() => {
  document.documentElement.classList.remove('soft-wrap');
});

describe('SettingsContext — soft wrap class on <html> (#179)', () => {
  it('marks the document when the setting is on', async () => {
    renderWithSoftWrap(true);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('soft-wrap')).toBe(true);
    });
  });

  it('leaves the document unmarked when the setting is off', async () => {
    renderWithSoftWrap(false);
    await waitFor(() => {
      expect(document.documentElement).toBeTruthy();
    });
    expect(document.documentElement.classList.contains('soft-wrap')).toBe(false);
  });

  it('defaults to off, so horizontal scrolling stays the default', async () => {
    // Nothing seeded: an unset setting must read as off rather than undefined
    // quietly turning wrapping on for everyone.
    renderWithSoftWrap();
    await waitFor(() => {
      expect(document.documentElement).toBeTruthy();
    });
    expect(document.documentElement.classList.contains('soft-wrap')).toBe(false);
  });

  it('clears the class when the setting is turned back off', async () => {
    // toggle(), not add(): a one-way effect would strand wrapping on until reload.
    document.documentElement.classList.add('soft-wrap');
    renderWithSoftWrap(false);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('soft-wrap')).toBe(false);
    });
  });
});
