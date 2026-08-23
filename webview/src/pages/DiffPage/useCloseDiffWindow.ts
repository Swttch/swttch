import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { isJetBrains } from '@/config/environment';

/**
 * Dismiss the window this diff page is filling.
 *
 * "The window" is a different thing in each host, and the page should not have
 * to know which one it is in:
 *
 *  - IDE editor tab: the backend closes it, because it is the side holding the
 *    tab. The page only has to stop asking — answering already told it.
 *  - browser tab: `window.close()`, which works because we opened the tab.
 *  - browser tab the user opened themselves (typed URL, bookmark, restored
 *    session): `window.close()` is refused, so fall back to navigating home
 *    rather than leaving a button that visibly does nothing.
 *
 * The overlay case does not come through here — it is dismissed by whoever
 * mounted it, which is the same component that would have to un-mount it.
 */
export function useCloseDiffWindow(): () => void {
  const navigate = useNavigate();

  return useCallback(() => {
    // In an IDE the tab is closed for us; nothing to do here.
    if (isJetBrains()) return;

    // Only a script-opened tab may close itself. `window.close()` on any other
    // is a silent no-op, so check first instead of hoping.
    if (window.opener) {
      window.close();
      return;
    }

    navigate('/sessions/new', { replace: true });
  }, [navigate]);
}
