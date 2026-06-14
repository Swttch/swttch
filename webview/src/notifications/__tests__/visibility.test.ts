import { describe, it, expect, afterEach } from 'vitest';
import { shouldNotifyForBackgroundEvent } from '../visibility';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

function setPanelId(id: string | null) {
  window.history.replaceState({}, '', id ? `/?panelId=${id}` : '/');
}

describe('shouldNotifyForBackgroundEvent()', () => {
  afterEach(() => {
    setHidden(false);
    setPanelId(null);
  });

  it('always returns true in the IDE (panelId present), regardless of document.hidden', () => {
    // JCEF document.hidden is unreliable, so the IDE host gates instead.
    setPanelId('panel-1');
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
    setHidden(true);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
  });

  it('returns document.hidden in standalone (no panelId)', () => {
    setPanelId(null);
    setHidden(true);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(false);
  });
});
