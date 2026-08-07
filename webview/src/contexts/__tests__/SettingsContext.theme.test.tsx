import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SettingsProvider } from '../SettingsContext';
import { SettingKey, ThemeMode, UiDirection } from '@/types/settings';
import { _resetRuntimeCache } from '@/config/environment';
import { createTestQueryClient } from '@/hooks/queries/__tests__/testQueryClient';

// ---------------------------------------------------------------------------
// Bridge / WorkingDir mocks (minimal — enough for SettingsProvider to mount)
// ---------------------------------------------------------------------------

// Use a never-resolving send() so the theme effect runs against DEFAULT_SETTINGS
// (which is ThemeMode.SYSTEM) and is not overwritten by a bridge response.
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

// ---------------------------------------------------------------------------
// matchMedia mock (jsdom does not provide this)
// ---------------------------------------------------------------------------

interface MatchMediaState {
  matches: boolean;
  listeners: Array<(e: MediaQueryListEvent) => void>;
}

const matchMediaState: MatchMediaState = {
  matches: false,
  listeners: [],
};

function installMatchMediaMock(initialMatches: boolean) {
  matchMediaState.matches = initialMatches;
  matchMediaState.listeners = [];
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: matchMediaState.matches,
      media: query,
      onchange: null,
      addEventListener: (_event: string, listener: (e: MediaQueryListEvent) => void) => {
        matchMediaState.listeners.push(listener);
      },
      removeEventListener: (_event: string, listener: (e: MediaQueryListEvent) => void) => {
        matchMediaState.listeners = matchMediaState.listeners.filter(l => l !== listener);
      },
      addListener: () => { /* legacy, unused */ },
      removeListener: () => { /* legacy, unused */ },
      dispatchEvent: () => false,
    }),
  });
}

// ---------------------------------------------------------------------------
// JCEF / IDE theme helpers
// ---------------------------------------------------------------------------

function setJcefEnv(enabled: boolean) {
  if (enabled) {
    (window as unknown as { __JCEF__?: boolean }).__JCEF__ = true;
  } else {
    delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
  }
  _resetRuntimeCache();
}

function setIdeTheme(value: 'dark' | 'light' | null) {
  const w = window as unknown as { __IDE_THEME__?: string };
  if (value === null) {
    delete w.__IDE_THEME__;
  } else {
    w.__IDE_THEME__ = value;
  }
}

// ---------------------------------------------------------------------------
// Test harness — render SettingsProvider with a given initial theme.
// We pre-seed localStorage so the initial render uses the desired theme
// (SettingsProvider loads from localStorage immediately on mount).
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'claude-code-settings';

function seedTheme(theme: ThemeMode) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [SettingKey.THEME]: theme }),
    );
  } catch {
    // ignore
  }
}

function renderWithTheme(theme: ThemeMode) {
  seedTheme(theme);
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <div data-testid="child">child</div>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

function seedSyncIdeTheme(enabled: boolean) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [SettingKey.SYNC_IDE_THEME]: enabled }),
    );
  } catch {
    // ignore
  }
}

function renderWithSyncIdeTheme(enabled: boolean) {
  seedSyncIdeTheme(enabled);
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <div data-testid="child">child</div>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

function seedUiDirection(uiDirection: UiDirection) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ [SettingKey.UI_DIRECTION]: uiDirection }),
    );
  } catch {
    // ignore
  }
}

function renderWithDirection(uiDirection: UiDirection) {
  seedUiDirection(uiDirection);
  const client = createTestQueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SettingsProvider>
        <div data-testid="child">child</div>
      </SettingsProvider>
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.remove('ide-theme-sync');
  document.documentElement.setAttribute('dir', 'ltr');
  setJcefEnv(false);
  setIdeTheme(null);
  installMatchMediaMock(false);
});

afterEach(() => {
  document.documentElement.classList.remove('dark');
  document.documentElement.classList.remove('ide-theme-sync');
  document.documentElement.setAttribute('dir', 'ltr');
  setJcefEnv(false);
  setIdeTheme(null);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SettingsContext theme — SYSTEM mode in JetBrains', () => {
  it('resolves to dark when __IDE_THEME__ is "dark"', async () => {
    setJcefEnv(true);
    setIdeTheme('dark');

    renderWithTheme(ThemeMode.SYSTEM);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('resolves to light when __IDE_THEME__ is "light"', async () => {
    setJcefEnv(true);
    setIdeTheme('light');

    renderWithTheme(ThemeMode.SYSTEM);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('reacts to ide-theme-changed events (light -> dark)', async () => {
    setJcefEnv(true);
    setIdeTheme('light');

    renderWithTheme(ThemeMode.SYSTEM);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    // Simulate IDE switching to dark mode at runtime
    act(() => {
      setIdeTheme('dark');
      window.dispatchEvent(new Event('ide-theme-changed'));
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('falls back to matchMedia when __IDE_THEME__ is missing', async () => {
    setJcefEnv(true);
    setIdeTheme(null);
    installMatchMediaMock(true); // OS prefers dark

    renderWithTheme(ThemeMode.SYSTEM);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });
});

describe('SettingsContext theme — SYSTEM mode in Standalone (browser)', () => {
  it('uses matchMedia (prefers-color-scheme: dark) to resolve to dark', async () => {
    setJcefEnv(false);
    installMatchMediaMock(true);

    renderWithTheme(ThemeMode.SYSTEM);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('uses matchMedia to resolve to light when OS prefers light', async () => {
    setJcefEnv(false);
    installMatchMediaMock(false);

    renderWithTheme(ThemeMode.SYSTEM);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});

describe('SettingsContext theme — explicit modes', () => {
  it('DARK applies .dark regardless of JetBrains env', async () => {
    setJcefEnv(true);
    setIdeTheme('light'); // IDE is light, but explicit DARK must win
    installMatchMediaMock(false);

    renderWithTheme(ThemeMode.DARK);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('DARK applies .dark in Standalone env', async () => {
    setJcefEnv(false);
    installMatchMediaMock(false);

    renderWithTheme(ThemeMode.DARK);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('LIGHT removes .dark regardless of JetBrains env', async () => {
    setJcefEnv(true);
    setIdeTheme('dark'); // IDE is dark, but explicit LIGHT must win
    installMatchMediaMock(true);
    document.documentElement.classList.add('dark'); // start with .dark

    renderWithTheme(ThemeMode.LIGHT);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('LIGHT removes .dark in Standalone env', async () => {
    setJcefEnv(false);
    installMatchMediaMock(true);
    document.documentElement.classList.add('dark');

    renderWithTheme(ThemeMode.LIGHT);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });
});

describe('SettingsContext syncIdeTheme — <html class="ide-theme-sync"> (issue #267)', () => {
  it('adds the class when the setting is on inside JetBrains', async () => {
    setJcefEnv(true);
    setIdeTheme('dark');

    renderWithSyncIdeTheme(true);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('ide-theme-sync')).toBe(true);
    });
  });

  it('does not add the class when the setting is off', async () => {
    setJcefEnv(true);
    setIdeTheme('dark');

    renderWithSyncIdeTheme(false);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('ide-theme-sync')).toBe(false);
    });
  });

  it('does not add the class in Standalone even when the setting is on', async () => {
    // Browser mode has no IDE colors to sync with, so the opt-in must not take
    // effect there — otherwise the CSS layer would fire with no variables set.
    setJcefEnv(false);

    renderWithSyncIdeTheme(true);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('ide-theme-sync')).toBe(false);
    });
  });

  it('is off by default (users keep our own palette until they opt in)', async () => {
    setJcefEnv(true);
    setIdeTheme('dark');

    // No seeded value — falls through to DEFAULT_SETTINGS.
    const client = createTestQueryClient();
    render(
      <QueryClientProvider client={client}>
        <SettingsProvider>
          <div data-testid="child">child</div>
        </SettingsProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement.classList.contains('ide-theme-sync')).toBe(false);
    });
  });

  it('keeps the class across an ide-theme-changed event (IDE theme switch)', async () => {
    setJcefEnv(true);
    setIdeTheme('light');

    renderWithSyncIdeTheme(true);

    await waitFor(() => {
      expect(document.documentElement.classList.contains('ide-theme-sync')).toBe(true);
    });

    // Kotlin re-injects colors and fires this on every LAF change; the opt-in
    // must survive so the newly injected colors keep applying.
    act(() => {
      setIdeTheme('dark');
      window.dispatchEvent(new Event('ide-theme-changed'));
    });

    await waitFor(() => {
      expect(document.documentElement.classList.contains('ide-theme-sync')).toBe(true);
    });
  });
});

describe('SettingsContext uiDirection — <html dir> mirroring', () => {
  it('sets dir="rtl" on <html> when uiDirection is RTL', async () => {
    renderWithDirection(UiDirection.RTL);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    });
  });

  it('sets dir="ltr" on <html> when uiDirection is LTR (default)', async () => {
    renderWithDirection(UiDirection.LTR);

    await waitFor(() => {
      expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    });
  });
});
