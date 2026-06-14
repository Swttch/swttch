import { describe, it, expect, afterEach } from 'vitest';
import { isIdeHost } from '../host';

describe('isIdeHost()', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('returns true when panelId is present in the page URL (IDE)', () => {
    window.history.replaceState({}, '', '/sessions/x?panelId=panel-1&workingDir=/repo');
    expect(isIdeHost()).toBe(true);
  });

  it('returns false when there is no panelId (standalone browser)', () => {
    window.history.replaceState({}, '', '/sessions/x?workingDir=/repo');
    expect(isIdeHost()).toBe(false);
  });
});
