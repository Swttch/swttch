import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { I18nLocaleSync, UI_LANGUAGE_STORAGE_KEY } from '../I18nLocaleSync';

// ---------------------------------------------------------------------------
// SettingsContext mock — I18nLocaleSync only reads settings.uiLanguage (moved
// out of the native ClaudeSettings into the app settings store).
// ---------------------------------------------------------------------------

let mockUiLanguage: string | undefined;

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    settings: { uiLanguage: mockUiLanguage },
  }),
}));

beforeEach(() => {
  mockUiLanguage = undefined;
  document.documentElement.lang = '';
  try {
    localStorage.clear();
  } catch {
    // ignore
  }
});

afterEach(() => {
  document.documentElement.lang = '';
});

describe('I18nLocaleSync — <html lang> sync', () => {
  it('sets <html lang> to the resolved locale for a RTL language (Persian)', async () => {
    mockUiLanguage = 'persian';
    render(<I18nLocaleSync />);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('fa');
    });
  });

  it('sets <html lang> to the resolved locale for a non-RTL language (Korean)', async () => {
    mockUiLanguage = 'korean';
    render(<I18nLocaleSync />);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('ko');
    });
  });

  it('defaults <html lang> to "en" when uiLanguage is unset', async () => {
    mockUiLanguage = undefined;
    render(<I18nLocaleSync />);

    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
    });
  });
});

describe('I18nLocaleSync — FOUC bootstrap cache (localStorage)', () => {
  it('caches uiLanguage under UI_LANGUAGE_STORAGE_KEY for the next boot', async () => {
    mockUiLanguage = 'arabic';
    render(<I18nLocaleSync />);

    await waitFor(() => {
      expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe('arabic');
    });
  });

  it('clears the cache when uiLanguage becomes unset', async () => {
    localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, 'arabic');
    mockUiLanguage = undefined;
    render(<I18nLocaleSync />);

    await waitFor(() => {
      expect(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBeNull();
    });
  });
});
