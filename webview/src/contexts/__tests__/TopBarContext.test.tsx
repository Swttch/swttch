import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { TopBarProvider, useTopBar, TOP_BAR_HEIGHT } from '../TopBarContext';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

function wrapperFor(props: { displayed?: boolean } = {}) {
  return ({ children }: { children: ReactNode }) => <TopBarProvider {...props}>{children}</TopBarProvider>;
}

describe('TopBarProvider', () => {
  it('draws the bar, at its full height, outside any provider', () => {
    const { result } = renderHook(() => useTopBar());

    expect(result.current).toEqual({ isTopBarDisplayed: true, topBarHeight: TOP_BAR_HEIGHT });
  });

  it('draws the bar when the address does not ask otherwise', () => {
    const { result } = renderHook(() => useTopBar(), { wrapper: wrapperFor() });

    expect(result.current.isTopBarDisplayed).toBe(true);
    expect(result.current.topBarHeight).toBe(TOP_BAR_HEIGHT);
  });

  it('hides the bar and takes no height for it when the address says top_bar_display=F', () => {
    window.history.replaceState(null, '', '/?top_bar_display=F');

    const { result } = renderHook(() => useTopBar(), { wrapper: wrapperFor() });

    expect(result.current).toEqual({ isTopBarDisplayed: false, topBarHeight: 0 });
  });

  it('keeps answering from the address the page was opened with, however the address changes after', () => {
    // A navigation inside the app rewrites the query string. The bar coming back
    // the first time the user switched session would be the parameter not being
    // honoured.
    window.history.replaceState(null, '', '/?top_bar_display=F');
    const { result, rerender } = renderHook(() => useTopBar(), { wrapper: wrapperFor() });

    window.history.replaceState(null, '', '/sessions/abc');
    rerender();

    expect(result.current.isTopBarDisplayed).toBe(false);
  });

  it('lets a host that is not a page decide instead of the address', () => {
    window.history.replaceState(null, '', '/?top_bar_display=F');

    const { result } = renderHook(() => useTopBar(), { wrapper: wrapperFor({ displayed: true }) });

    expect(result.current.isTopBarDisplayed).toBe(true);
  });
});
