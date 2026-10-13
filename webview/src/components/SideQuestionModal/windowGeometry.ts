/**
 * Size and position arithmetic for the floating side-question window.
 *
 * Everything here is a pure function of numbers, so a drag is always computed
 * from the rect the drag STARTED with plus the total distance the pointer has
 * travelled — never by adding up per-event deltas, which drift and leave the
 * window lagging behind the cursor.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Which edge or corner of the window a resize drag holds. */
export enum ResizeEdge {
  North = 'n',
  South = 's',
  East = 'e',
  West = 'w',
  NorthEast = 'ne',
  NorthWest = 'nw',
  SouthEast = 'se',
  SouthWest = 'sw',
}

/** The smallest the window can be dragged down to. */
export const MIN_SIZE: Size = { width: 360, height: 300 };

/**
 * 1rem on every side when maximized, and the gap kept from the viewport by
 * default. 16 is only the fallback: the webview's root font size is the user's
 * own setting, so callers pass what 1rem measures in their window.
 */
export const MAXIMIZED_MARGIN_PX = 16;

/** The minimized window: a floating round button parked in the corner. */
export const MINIMIZED_SIZE_PX = 44;

const DEFAULT_WIDTH_PX = 768;
const DEFAULT_HEIGHT_OFFSET_PX = 60;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function maximizedRect(viewport: Size, margin = MAXIMIZED_MARGIN_PX): Rect {
  return {
    left: margin,
    top: margin,
    width: viewport.width - 2 * margin,
    height: viewport.height - 2 * margin,
  };
}

/** Centred, about half the window tall — what the window opens as the first time. */
export function defaultRect(viewport: Size, margin = MAXIMIZED_MARGIN_PX): Rect {
  const maxWidth = viewport.width - 2 * margin;
  const maxHeight = viewport.height - 2 * margin;
  const width = Math.min(DEFAULT_WIDTH_PX, maxWidth);
  const height = Math.min(maxHeight, Math.round(viewport.height * 0.5) + DEFAULT_HEIGHT_OFFSET_PX);
  return {
    left: Math.round((viewport.width - width) / 2),
    top: Math.round((viewport.height - height) / 2),
    width,
    height,
  };
}

/**
 * The parked button, in the bottom-right corner. `bottomLine` is the y the
 * button rests on — the top of the chat input, so it never covers the send
 * button.
 */
export function minimizedRect(viewport: Size, bottomLine: number, rightGap = MAXIMIZED_MARGIN_PX): Rect {
  const bottom = clamp(bottomLine, MINIMIZED_SIZE_PX, viewport.height);
  return {
    left: viewport.width - rightGap - MINIMIZED_SIZE_PX,
    top: bottom - MINIMIZED_SIZE_PX,
    width: MINIMIZED_SIZE_PX,
    height: MINIMIZED_SIZE_PX,
  };
}

export function moveRect(start: Rect, dx: number, dy: number, viewport: Size): Rect {
  return {
    ...start,
    left: clamp(start.left + dx, 0, viewport.width - start.width),
    top: clamp(start.top + dy, 0, viewport.height - start.height),
  };
}

/**
 * Drag one edge or corner. The edge held follows the pointer; the opposite edge
 * stays exactly where it was, including when the window hits its minimum size
 * (without that, dragging the left edge past the minimum would push the whole
 * window along).
 */
export function resizeRect(start: Rect, edge: ResizeEdge, dx: number, dy: number, viewport: Size): Rect {
  const holdsWest = edge === ResizeEdge.West || edge === ResizeEdge.NorthWest || edge === ResizeEdge.SouthWest;
  const holdsEast = edge === ResizeEdge.East || edge === ResizeEdge.NorthEast || edge === ResizeEdge.SouthEast;
  const holdsNorth = edge === ResizeEdge.North || edge === ResizeEdge.NorthWest || edge === ResizeEdge.NorthEast;
  const holdsSouth = edge === ResizeEdge.South || edge === ResizeEdge.SouthWest || edge === ResizeEdge.SouthEast;

  let left = start.left;
  let right = start.left + start.width;
  let top = start.top;
  let bottom = start.top + start.height;

  if (holdsWest) left = clamp(start.left + dx, 0, right - MIN_SIZE.width);
  if (holdsEast) right = clamp(right + dx, left + MIN_SIZE.width, viewport.width);
  if (holdsNorth) top = clamp(start.top + dy, 0, bottom - MIN_SIZE.height);
  if (holdsSouth) bottom = clamp(bottom + dy, top + MIN_SIZE.height, viewport.height);

  return { left, top, width: right - left, height: bottom - top };
}

/** Pull a rect back inside the viewport, after the viewport itself shrank. */
export function clampRect(rect: Rect, viewport: Size): Rect {
  const width = Math.min(rect.width, viewport.width);
  const height = Math.min(rect.height, viewport.height);
  return {
    left: clamp(rect.left, 0, viewport.width - width),
    top: clamp(rect.top, 0, viewport.height - height),
    width,
    height,
  };
}
