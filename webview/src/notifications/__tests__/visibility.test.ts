import { describe, it, expect, afterEach } from 'vitest';
import { _resetRuntimeCache } from '@/config/environment';
import { shouldNotifyForBackgroundEvent } from '../visibility';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

/**
 * Stands in for the marker Kotlin injects before any page JS runs. This is the
 * whole point of the fix: it is a property of the runtime, so it is set for
 * every URL the page ever visits.
 */
function setJcefMarker(present: boolean) {
  if (present) {
    (window as unknown as { __JCEF__?: boolean }).__JCEF__ = true;
  } else {
    delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
  }
  _resetRuntimeCache();
}

function setPanelId(id: string | null) {
  window.history.replaceState({}, '', id ? `/?panelId=${id}` : '/');
}

describe('shouldNotifyForBackgroundEvent()', () => {
  afterEach(() => {
    setHidden(false);
    setJcefMarker(false);
    setPanelId(null);
  });

  it('always returns true in the IDE, regardless of document.hidden', () => {
    // JCEF document.hidden is unreliable, so the IDE host gates instead.
    setJcefMarker(true);
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
    setHidden(true);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
  });

  /**
   * The reported defect, stated as the state the machine was actually in.
   *
   * The IDE opens the page with a `panelId` on the URL and drops it on the
   * first navigation, which is the moment the first session is created. Judging
   * the host by that parameter therefore called the IDE a browser for every
   * turn after the first, fell through to `document.hidden` — which JCEF leaves
   * false — and never raised another banner.
   */
  it('returns true in the IDE even after the URL has lost its panelId', () => {
    setJcefMarker(true);
    setPanelId(null);
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
  });

  it('returns document.hidden in standalone', () => {
    setJcefMarker(false);
    setHidden(true);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(false);
  });

  /**
   * The mirror of the test above it. A `panelId` on the URL is not evidence of
   * anything on its own — a standalone page that happens to carry one is still
   * a browser and must still be gated on `document.hidden`.
   */
  it('ignores a panelId on the URL when the runtime is a browser', () => {
    setJcefMarker(false);
    setPanelId('panel-1');
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(false);
  });
});
