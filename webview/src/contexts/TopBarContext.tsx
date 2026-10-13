import { createContext, useContext, useState, type ReactNode } from 'react';
import { readIsDesktopFromUrl, readTopBarDisplayFromUrl } from './topBarDisplayParam';

/** How tall the top bar is when drawn. The one place this number is written. */
export const TOP_BAR_HEIGHT = 40;

export interface TopBarValue {
  /** Whether the top bar is drawn. */
  isTopBarDisplayed: boolean;
  /**
   * The vertical space the bar takes from the top of the screen: its height
   * when drawn, zero when not.
   *
   * Everything laid out around the bar — the scroll container's top padding, the
   * banners hanging under it, the toasts, the line a pinned send sticks to —
   * reads this instead of carrying a 40 of its own, so hiding the bar moves all
   * of them together and a future change of height cannot leave one behind.
   */
  topBarHeight: number;
  /**
   * Whether the page is the chat view the Desktop app shows inside its own
   * window (`is_desktop=1`). The Desktop app draws a header of its own above the
   * page, so what sat against the page's top edge needs that room back.
   */
  isDesktop: boolean;
}

const DISPLAYED: TopBarValue = { isTopBarDisplayed: true, topBarHeight: TOP_BAR_HEIGHT, isDesktop: false };

/**
 * Drawn is the default outside a provider, which is the ordinary case for the
 * components reused on screens that have no say in it and for their tests.
 */
const TopBarContext = createContext<TopBarValue>(DISPLAYED);

interface TopBarProviderProps {
  /** Decides the answer instead of the URL; for a host that is not a page. */
  displayed?: boolean;
  /** Decides whether this is the Desktop app instead of the URL; for a host that is not a page. */
  desktop?: boolean;
  children: ReactNode;
}

/**
 * Holds whether the top bar is drawn and whether this is the Desktop app, read
 * once when the app starts.
 *
 * Once, and from the address the page was opened with: a navigation inside the
 * app rewrites the query string, and a bar that came back the first time the
 * user switched session would be the parameter not being honoured. Mounted above
 * the router for the same reason — nothing has had the chance to rewrite the
 * address yet when this reads it.
 */
export function TopBarProvider({ displayed, desktop, children }: TopBarProviderProps) {
  const [value] = useState<TopBarValue>(() => {
    const isDisplayed = displayed ?? readTopBarDisplayFromUrl(window.location.search);
    const isDesktop = desktop ?? readIsDesktopFromUrl(window.location.search);
    return { isTopBarDisplayed: isDisplayed, topBarHeight: isDisplayed ? TOP_BAR_HEIGHT : 0, isDesktop };
  });
  return <TopBarContext.Provider value={value}>{children}</TopBarContext.Provider>;
}

export function useTopBar(): TopBarValue {
  return useContext(TopBarContext);
}
