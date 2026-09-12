import { describe, it, expect, beforeEach } from 'vitest';
import {
  UNREADABLE,
  markVersionSeen,
  readLastSeenVersion,
  shouldShowWhatsNew,
} from '../lastSeenVersion';

// The modal opens once per installed version. Everything that decides "once"
// lives in shouldShowWhatsNew, so the edge cases are pinned here rather than
// through the component.
describe('shouldShowWhatsNew', () => {
  it('opens when the installed version differs from the last one shown', () => {
    expect(shouldShowWhatsNew('0.31.0', '0.30.2')).toBe(true);
  });

  it('stays closed on a relaunch of the same version', () => {
    expect(shouldShowWhatsNew('0.30.2', '0.30.2')).toBe(false);
  });

  it('stays closed on a first-ever launch, which has nothing to compare against', () => {
    expect(shouldShowWhatsNew('0.30.2', null)).toBe(false);
  });

  it('stays closed when localStorage cannot be read, rather than opening every launch', () => {
    expect(shouldShowWhatsNew('0.30.2', UNREADABLE)).toBe(false);
  });

  it.each(['unknown', '...', '', null, undefined])(
    'stays closed while the version is still %s',
    (version) => {
      expect(shouldShowWhatsNew(version, '0.30.2')).toBe(false);
    },
  );
});

describe('markVersionSeen', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('makes the same version stop qualifying', () => {
    expect(shouldShowWhatsNew('0.31.0', readLastSeenVersion())).toBe(false); // nothing recorded yet
    markVersionSeen('0.31.0');
    expect(readLastSeenVersion()).toBe('0.31.0');
    expect(shouldShowWhatsNew('0.31.0', readLastSeenVersion())).toBe(false);
    expect(shouldShowWhatsNew('0.32.0', readLastSeenVersion())).toBe(true);
  });
});
