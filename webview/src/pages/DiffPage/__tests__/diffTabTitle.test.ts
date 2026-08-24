/**
 * What the review names the tab it is drawn in.
 *
 * The window is addressed by tool call and fetches the file afterwards, so the
 * label cannot be right at open time — it starts generic and narrows.
 *
 * The overlay case is the sharp one, and it is not hypothetical: settings hit it
 * first. The IDE takes an editor tab's label from document.title and PERSISTS
 * it, so a page drawn over a chat that renames the tab leaves the wrong name
 * behind after it closes. See settingsTabTitle.
 */
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { diffTabTitle } from '..';
import { useStaticDocumentTitle } from '@/hooks/useStaticDocumentTitle';

describe('diffTabTitle', () => {
  it('names the file under review', () => {
    expect(diffTabTitle('cart.js', false)).toBe('Diff: cart.js');
  });

  it('falls back to a generic label before the file is known', () => {
    // The window opens on a tool-call id and fetches the change afterwards, so
    // there is a first paint with no file name in hand.
    expect(diffTabTitle('', false)).toBe('Diff view');
  });

  it('claims nothing when drawn as an overlay', () => {
    expect(diffTabTitle('cart.js', true)).toBe('');
  });

  it('leaves the underlying tab title intact in overlay mode', () => {
    // End-to-end through the hook: returning '' only helps if the hook treats it
    // as "leave it alone" rather than blanking the label.
    document.title = 'my-project — Claude Code';
    renderHook(() => useStaticDocumentTitle(diffTabTitle('cart.js', true)));
    expect(document.title).toBe('my-project — Claude Code');
  });

  it('sets the tab title when the page owns the window', () => {
    document.title = 'my-project — Claude Code';
    renderHook(() => useStaticDocumentTitle(diffTabTitle('cart.js', false)));
    expect(document.title).toBe('Diff: cart.js');
  });
});
