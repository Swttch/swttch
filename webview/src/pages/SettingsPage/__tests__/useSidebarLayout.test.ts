import { describe, it, expect } from 'vitest';
import {
  measureSidebar,
  SidebarMode,
  SIDEBAR_SHARE,
  SIDEBAR_MIN_REM,
  SIDEBAR_MAX_REM,
  ICON_WIDTH_REM,
  ICONS_BELOW_REM,
  DRAWER_BELOW_REM,
  CONTENT_FLOOR_REM,
  FULL_COLUMN_STYLE,
  ICON_COLUMN_STYLE,
  CONTENT_FLOOR_STYLE,
} from '../useSidebarLayout';

/** What the browser resolves `FULL_COLUMN_STYLE` to at a given row width, in rem. */
function columnRem(rowRem: number): number {
  return Math.min(SIDEBAR_MAX_REM, Math.max(SIDEBAR_MIN_REM, rowRem * SIDEBAR_SHARE));
}

describe('measureSidebar', () => {
  it('keeps labels while the row can seat a column of them', () => {
    expect(measureSidebar(80)).toBe(SidebarMode.FULL);
    expect(measureSidebar(ICONS_BELOW_REM)).toBe(SidebarMode.FULL);
  });

  it('folds the labels away once the column has finished shrinking', () => {
    expect(measureSidebar(ICONS_BELOW_REM - 0.01)).toBe(SidebarMode.ICONS);
  });

  it('gives up its column when the content needs the whole row', () => {
    expect(measureSidebar(DRAWER_BELOW_REM)).toBe(SidebarMode.ICONS);
    expect(measureSidebar(DRAWER_BELOW_REM - 0.01)).toBe(SidebarMode.DRAWER);
  });
});

describe('the column gives ground before the content does', () => {
  it('takes the whole shortfall until it has nothing left to give', () => {
    // Between these two widths the row loses 10rem. All of it comes out of the
    // sidebar; the content column is the same size at both.
    const wide = SIDEBAR_MAX_REM / SIDEBAR_SHARE;
    const tight = wide - 10;
    expect(columnRem(wide)).toBe(SIDEBAR_MAX_REM);
    expect(wide - columnRem(wide)).toBeCloseTo(tight - columnRem(tight) + 10 - 10 * SIDEBAR_SHARE, 6);
    expect(columnRem(tight)).toBeLessThan(SIDEBAR_MAX_REM);
  });

  it('never grows past the width a label needs, however wide the row', () => {
    expect(columnRem(300)).toBe(SIDEBAR_MAX_REM);
  });

  it('folds exactly when the column bottoms out, not before', () => {
    // The threshold is derived from the share and the minimum rather than
    // picked, so a labelled column is never folded away while it still had room
    // to shrink, and never shrinks below the width its labels need.
    expect(columnRem(ICONS_BELOW_REM)).toBeCloseTo(SIDEBAR_MIN_REM, 6);
    expect(measureSidebar(ICONS_BELOW_REM)).toBe(SidebarMode.FULL);
    expect(measureSidebar(ICONS_BELOW_REM - 0.01)).toBe(SidebarMode.ICONS);
  });

  it('leaves the content exactly the rest of the row at that width', () => {
    expect(CONTENT_FLOOR_REM + SIDEBAR_MIN_REM).toBeCloseTo(ICONS_BELOW_REM, 6);
  });
});

describe('every width is stated in rem', () => {
  // This app has a font size setting, so `1rem` is whatever the user chose —
  // 14px by default. A width written in pixels is wrong by that ratio, and the
  // error shows up as a margin on one side of the icon column and nowhere else.
  it('sizes the labelled column the width it has always had', () => {
    expect(FULL_COLUMN_STYLE.maxWidth).toBe('12rem');
    expect(FULL_COLUMN_STYLE.minWidth).toBe('8.25rem');
    expect(FULL_COLUMN_STYLE.width).toBe('22%');
  });

  it('adds the icon column up from the padding and glyph it holds', () => {
    // list padding either side + button padding either side + the glyph
    expect(ICON_WIDTH_REM).toBeCloseTo(0.5 * 2 + 0.75 * 2 + 1, 6);
    expect(ICON_COLUMN_STYLE.width).toBe('3.5rem');
  });

  it('states the content floor in rem too', () => {
    expect(CONTENT_FLOOR_STYLE.minWidth).toBe(`${CONTENT_FLOOR_REM}rem`);
  });
});
