import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MessageType } from '@/shared';

const sendMock = vi.fn(() => Promise.resolve({}));

vi.mock('../useBridge', () => ({
  useBridge: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    lastError: null,
  }),
}));

import { HIDDEN_REPORT_DELAY_MS, useReportPanelVisibility } from '../useReportPanelVisibility';

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function reports(): boolean[] {
  return (sendMock.mock.calls as unknown as Array<[string, { visible: boolean }]>)
    .filter(([type]) => type === MessageType.REPORT_PANEL_VISIBILITY)
    .map(([, payload]) => payload.visible);
}

/**
 * What a screen tells the backend about whether it is showing. The backend stops the CLI of
 * a session whose every screen has stayed hidden for a minute, so a hidden report that is
 * wrong (a flash, a stale one left after leaving) costs a CLI restart the user can feel.
 */
describe('useReportPanelVisibility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendMock.mockClear();
    setVisibility('visible');
    sendMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    setVisibility('visible');
    delete (window as unknown as { __ccgHostShowing?: boolean }).__ccgHostShowing;
  });

  function hostSays(showing: boolean) {
    (window as unknown as { __ccgHostShowing?: boolean }).__ccgHostShowing = showing;
    window.dispatchEvent(new CustomEvent('ide-panel-showing', { detail: { showing } }));
  }

  it('reports showing on mount', () => {
    renderHook(() => useReportPanelVisibility());
    expect(reports()).toEqual([true]);
  });

  it('reports hidden only after the page stays hidden for the delay', () => {
    renderHook(() => useReportPanelVisibility());
    sendMock.mockClear();

    setVisibility('hidden');
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS - 1);
    expect(reports()).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(reports()).toEqual([false]);
  });

  it('does not report the hidden-then-visible flash the JetBrains webview produces', () => {
    renderHook(() => useReportPanelVisibility());
    sendMock.mockClear();

    setVisibility('hidden');
    vi.advanceTimersByTime(43);
    setVisibility('visible');
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS * 2);
    expect(reports()).toEqual([]);
  });

  it('reports showing again at once after a hidden report', () => {
    renderHook(() => useReportPanelVisibility());
    setVisibility('hidden');
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS);
    sendMock.mockClear();

    setVisibility('visible');
    expect(reports()).toEqual([true]);
  });

  it('leaves no hidden report behind when the screen goes away', () => {
    const { unmount } = renderHook(() => useReportPanelVisibility());
    setVisibility('hidden');
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS);
    sendMock.mockClear();

    unmount();
    expect(reports()).toEqual([true]);
  });

  // IDE 2026.3 keeps a covered tab's page `visible`; only the host knows it is covered.
  it('reports hidden when the host says the tab is not showing, though the page says visible', () => {
    renderHook(() => useReportPanelVisibility());
    sendMock.mockClear();

    hostSays(false);
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS);
    expect(reports()).toEqual([false]);
  });

  it('reports showing again when the host says the tab is showing', () => {
    renderHook(() => useReportPanelVisibility());
    hostSays(false);
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS);
    sendMock.mockClear();

    hostSays(true);
    expect(reports()).toEqual([true]);
  });

  it('stays hidden while the page says hidden even when the host says showing', () => {
    renderHook(() => useReportPanelVisibility());
    setVisibility('hidden');
    hostSays(true);
    sendMock.mockClear();
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS);
    expect(reports()).toEqual([false]);
  });

  it('starts hidden when the host already said so before the page began reporting', () => {
    (window as unknown as { __ccgHostShowing?: boolean }).__ccgHostShowing = false;
    renderHook(() => useReportPanelVisibility());
    sendMock.mockClear();
    vi.advanceTimersByTime(HIDDEN_REPORT_DELAY_MS);
    expect(reports()).toEqual([false]);
  });
});
