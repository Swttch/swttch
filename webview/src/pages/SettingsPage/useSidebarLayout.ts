import { useEffect, useState } from 'react';
import { useSettingsOrNull } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';

/** How much room the settings screen has for a navigation column. */
export enum SidebarMode {
  /** A column wide enough to read labels in. */
  FULL = 'full',
  /** A column of icons. The labels are still there, folded shut. */
  ICONS = 'icons',
  /** No room for a column at all, so it opens over the content instead. */
  DRAWER = 'drawer',
}

/**
 * Every width below is in rem, and the unit is not incidental.
 *
 * This app has a font size setting, so `1rem` is whatever the user chose — 14px
 * by default, not the 16px a bare number would assume. Writing these as pixels
 * makes each one wrong by that ratio: an icon column stated as 56px is 7px wider
 * than its own padding and glyph need at 14px, and the slack lands at one end,
 * which is a column of icons sitting off-centre. The same mistake widened the
 * labelled column from the 12rem it had always been to a fixed 192px.
 */

/**
 * The share of the row a labelled column asks for.
 *
 * Asking for a share rather than a fixed width is what makes the column give
 * ground first: the content column takes what is left over, so every pixel the
 * row loses comes out of the sidebar until the sidebar has no more to give. A
 * fixed width does the opposite — it holds its size and the content absorbs the
 * whole loss, which is what this screen used to do.
 */
export const SIDEBAR_SHARE = 0.22;

/** Labels and icons, and as wide as the column ever gets however wide the row. */
export const SIDEBAR_MAX_REM = 12;

/**
 * The narrowest a labelled column goes. Below this the longer nav labels are cut
 * to two or three characters and an ellipsis, which says less than the icon
 * beside them already does.
 */
export const SIDEBAR_MIN_REM = 8.25;

/**
 * Icons only, and added up rather than chosen: the list's own padding either
 * side (`px-2`, 0.5rem each), the button's (`px-3`, 0.75rem each), and the glyph
 * between them (`w-4`, 1rem). Get this wrong in either direction and the
 * leftover shows up as a margin on one side only.
 */
export const ICON_WIDTH_REM = 0.5 * 2 + 0.75 * 2 + 1;

/**
 * Where a labelled column becomes an icon column.
 *
 * Derived rather than picked, and the derivation is the point: a share of this
 * row is exactly the minimum, so the column folds its labels at the moment it
 * has finished shrinking and not one pixel earlier.
 */
export const ICONS_BELOW_REM = SIDEBAR_MIN_REM / SIDEBAR_SHARE;

/**
 * What the content column is owed once the sidebar has stopped shrinking.
 *
 * It is the rest of the row at the width the sidebar folds, which is what keeps
 * the two from arguing: above that width the share governs and the content takes
 * what is left, at that width the two floors meet exactly, and below it there is
 * no labelled column to divide the row with.
 */
export const CONTENT_FLOOR_REM = ICONS_BELOW_REM - SIDEBAR_MIN_REM;

/**
 * Where an icon column stops being worth its place. Under this the content is
 * what the row is for, so the navigation gives up its column and waits to be
 * asked for.
 */
export const DRAWER_BELOW_REM = 28;

/**
 * What a labelled column is sized by. Handed to the element rather than applied
 * as a class so that the numbers above are the only place they are written.
 */
export const FULL_COLUMN_STYLE = {
  width: `${SIDEBAR_SHARE * 100}%`,
  minWidth: `${SIDEBAR_MIN_REM}rem`,
  maxWidth: `${SIDEBAR_MAX_REM}rem`,
} as const;

export const ICON_COLUMN_STYLE = { width: `${ICON_WIDTH_REM}rem` } as const;

export const CONTENT_FLOOR_STYLE = { minWidth: `${CONTENT_FLOOR_REM}rem` } as const;

/**
 * Turns the width of the row that holds the sidebar and the content into which
 * of the three shapes the navigation takes.
 *
 * Takes rem, not pixels, for the reason at the top of this file. Only the shape:
 * inside `FULL` the width is the browser's to work out from `FULL_COLUMN_STYLE`,
 * which is both smoother than recomputing it here on every resize frame and the
 * reason the column can shrink at all.
 *
 * Kept apart from the hook, and from React, because the thresholds are the thing
 * worth asserting against.
 */
export function measureSidebar(rowRem: number): SidebarMode {
  if (rowRem < DRAWER_BELOW_REM) return SidebarMode.DRAWER;
  if (rowRem < ICONS_BELOW_REM) return SidebarMode.ICONS;
  return SidebarMode.FULL;
}

/** What the user's font size setting has made `1rem` worth right now. */
function remInPixels(): number {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * Watches the row the sidebar sits in and reports what fits.
 *
 * The row, not the viewport: the settings screen renders inside an overlay with
 * a max width in the browser and inside a tool window of any width in the IDE,
 * so a viewport media query would be answering a different question from the one
 * being asked. Measured with a ResizeObserver rather than a container query
 * because a container query the embedded browser does not support fails by
 * laying out wrongly, with nothing raised and nothing logged.
 *
 * Returns a ref callback to put on the row. It is state rather than a `useRef`
 * so that the effect runs again when the node actually attaches.
 */
export function useSidebarLayout(): { mode: SidebarMode; ref: (node: HTMLElement | null) => void } {
  const [row, setRow] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<SidebarMode>(SidebarMode.FULL);

  // Changing the font size changes what the row's pixels are worth without
  // changing how many of them there are, so it has to re-measure on its own
  // account. It does happen to re-measure anyway today, because the header's
  // padding is in rem and so the row's HEIGHT moves too, which a ResizeObserver
  // reports — but that is a coincidence of this layout rather than a rule, and
  // it would go quiet the day someone gave the header a pixel height.
  const fontSize = useSettingsOrNull()?.settings[SettingKey.FONT_SIZE];

  useEffect(() => {
    if (!row) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setMode(measureSidebar(entry.contentRect.width / remInPixels()));
    });
    observer.observe(row);
    return () => observer.disconnect();
  }, [row, fontSize]);

  return { mode, ref: setRow };
}
