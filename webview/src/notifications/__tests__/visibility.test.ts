import { describe, it, expect, afterEach } from 'vitest';
import { shouldNotifyForBackgroundEvent } from '../visibility';

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
}

describe('shouldNotifyForBackgroundEvent()', () => {
  afterEach(() => {
    setHidden(false);
  });

  it('returns true when the page is hidden (tab backgrounded / editor tab not selected)', () => {
    setHidden(true);
    expect(shouldNotifyForBackgroundEvent()).toBe(true);
  });

  it('returns false when the page is visible (user is looking at this session)', () => {
    setHidden(false);
    expect(shouldNotifyForBackgroundEvent()).toBe(false);
  });
});
