import { describe, it, expect } from 'vitest';
import {
  readIsDesktopFromUrl,
  readTopBarDisplayFromUrl,
  IS_DESKTOP_PARAM_KEY,
  TOP_BAR_DISPLAY_PARAM_KEY,
} from '../topBarDisplayParam';

describe('readIsDesktopFromUrl', () => {
  it('is not the Desktop app when the parameter is absent', () => {
    expect(readIsDesktopFromUrl('')).toBe(false);
    expect(readIsDesktopFromUrl('?workingDir=%2Ftmp%2Fproject')).toBe(false);
  });

  it.each(['1', 'true', 'TRUE', 't', 'T', ' 1 '])('is the Desktop app for is_desktop=%s', (value) => {
    expect(readIsDesktopFromUrl(`?is_desktop=${encodeURIComponent(value)}`)).toBe(true);
  });

  it.each(['0', 'false', 'f', '', 'no', 'yes', 'desktop'])(
    'is not the Desktop app for is_desktop=%s, so a typo never makes it one',
    (value) => {
      expect(readIsDesktopFromUrl(`?is_desktop=${value}`)).toBe(false);
    },
  );

  it('does not take the older top_bar_display=F for the Desktop app, because that only asked for the bar to be hidden', () => {
    expect(readIsDesktopFromUrl('?top_bar_display=F')).toBe(false);
  });
});

describe('readTopBarDisplayFromUrl', () => {
  it('names the parameter the way a CLI option is named', () => {
    expect(IS_DESKTOP_PARAM_KEY).toBe('is_desktop');
    expect(TOP_BAR_DISPLAY_PARAM_KEY).toBe('top_bar_display');
  });

  it.each(['1', 'true', 'TRUE', 't', 'T', ' 1 '])('hides the bar for is_desktop=%s', (value) => {
    expect(readTopBarDisplayFromUrl(`?is_desktop=${encodeURIComponent(value)}`)).toBe(false);
  });

  it.each(['0', 'false', 'f', '', 'no', 'yes', 'desktop'])(
    'keeps the bar for is_desktop=%s, so a typo never takes it away',
    (value) => {
      expect(readTopBarDisplayFromUrl(`?is_desktop=${value}`)).toBe(true);
    },
  );

  it('finds is_desktop among the other parameters', () => {
    expect(readTopBarDisplayFromUrl('?workingDir=%2Ftmp%2Fproject&is_desktop=1&pair=abc')).toBe(false);
  });

  it('ignores a parameter that only looks like is_desktop', () => {
    expect(readTopBarDisplayFromUrl('?isDesktop=1')).toBe(true);
    expect(readTopBarDisplayFromUrl('?is-desktop=1')).toBe(true);
  });

  it('still hides the bar for the older top_bar_display=F that shipped Desktop apps send', () => {
    expect(readTopBarDisplayFromUrl('?top_bar_display=F')).toBe(false);
  });

  it('hides the bar when either parameter asks for it', () => {
    expect(readTopBarDisplayFromUrl('?is_desktop=1&top_bar_display=T')).toBe(false);
    expect(readTopBarDisplayFromUrl('?is_desktop=0&top_bar_display=F')).toBe(false);
    expect(readTopBarDisplayFromUrl('?is_desktop=1&top_bar_display=F')).toBe(false);
  });

  it('shows the bar when neither parameter asks to hide it', () => {
    expect(readTopBarDisplayFromUrl('?is_desktop=0&top_bar_display=T')).toBe(true);
  });

  it('shows the bar when the parameter is absent', () => {
    expect(readTopBarDisplayFromUrl('')).toBe(true);
    expect(readTopBarDisplayFromUrl('?workingDir=%2Ftmp%2Fproject')).toBe(true);
  });

  it.each(['F', 'f', 'false', 'FALSE', '0', ' F '])('hides the bar for top_bar_display=%s', (value) => {
    expect(readTopBarDisplayFromUrl(`?top_bar_display=${encodeURIComponent(value)}`)).toBe(false);
  });

  it.each(['T', 't', 'true', '1', '', 'no', 'hidden'])(
    'keeps the bar for top_bar_display=%s, so a typo never takes it away',
    (value) => {
      expect(readTopBarDisplayFromUrl(`?top_bar_display=${value}`)).toBe(true);
    },
  );

  it('finds the parameter among the others', () => {
    expect(readTopBarDisplayFromUrl('?workingDir=%2Ftmp%2Fproject&top_bar_display=F&rootUp=1')).toBe(false);
  });

  it('ignores a parameter that only looks similar', () => {
    expect(readTopBarDisplayFromUrl('?topBarDisplay=F')).toBe(true);
  });
});
