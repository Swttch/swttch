import { describe, it, expect } from 'vitest';
import { readTopBarDisplayFromUrl, TOP_BAR_DISPLAY_PARAM_KEY } from '../topBarDisplayParam';

describe('readTopBarDisplayFromUrl', () => {
  it('names the parameter the way a CLI option is named', () => {
    expect(TOP_BAR_DISPLAY_PARAM_KEY).toBe('top_bar_display');
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
