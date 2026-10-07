import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ForwardingFallback,
  _resetForwardingFallback,
  readForwardingFallback,
} from '../forwardingFallback';

function loadedAt(search: string) {
  window.history.replaceState(null, '', `/sessions/new${search}`);
  _resetForwardingFallback();
}

describe('readForwardingFallback', () => {
  beforeEach(() => _resetForwardingFallback());
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    _resetForwardingFallback();
  });

  it('is null for a page loaded without the param (local IDE, granted forward, browser)', () => {
    loadedAt('?panelId=p1&theme=dark');
    expect(readForwardingFallback()).toBeNull();
  });

  it.each(Object.values(ForwardingFallback))('reads %s from the URL the IDE opened', (reason) => {
    loadedAt(`?panelId=p1&forwarding=${reason}`);
    expect(readForwardingFallback()).toBe(reason);
  });

  it('ignores a value Kotlin never sends', () => {
    loadedAt('?forwarding=whatever');
    expect(readForwardingFallback()).toBeNull();
  });

  it('keeps the reason after the query is gone, since in-app navigation drops it', () => {
    loadedAt('?forwarding=disabled');
    expect(readForwardingFallback()).toBe(ForwardingFallback.Disabled);

    window.history.replaceState(null, '', '/sessions/abc');
    expect(readForwardingFallback()).toBe(ForwardingFallback.Disabled);
  });
});
