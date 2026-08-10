/**
 * The overlay must not rename the editor tab it is drawn over.
 *
 * `SettingsPage` renders in both modes (see the "Open Settings as" setting).
 * When it ran unconditionally, opening settings as an overlay retitled the
 * underlying Claude Code tab to "Settings" — the chat was still the tab's
 * content, and because the IDE takes the editor tab's label from
 * document.title and persists it, the wrong name stuck around after the
 * overlay closed.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { settingsTabTitle } from '../index';
import { useStaticDocumentTitle } from '@/hooks';

describe('settingsTabTitle', () => {
  it('claims the tab when settings own the whole page', () => {
    expect(settingsTabTitle(false)).not.toBe('');
  });

  it('claims nothing when settings are an overlay', () => {
    expect(settingsTabTitle(true)).toBe('');
  });

  it('leaves an existing tab title intact in overlay mode', () => {
    // End-to-end through the hook: an empty title must be a no-op, otherwise
    // returning '' above would still blank the tab label.
    document.title = 'my-project — Claude Code';
    renderHook(() => useStaticDocumentTitle(settingsTabTitle(true)));
    expect(document.title).toBe('my-project — Claude Code');
  });

  it('sets the tab title in full-page mode', () => {
    document.title = 'my-project — Claude Code';
    renderHook(() => useStaticDocumentTitle(settingsTabTitle(false)));
    expect(document.title).toBe(settingsTabTitle(false));
  });
});
