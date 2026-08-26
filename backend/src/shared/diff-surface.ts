/**
 * Where a proposed file edit is drawn for review:
 * - ide: the IDE's own diff viewer, opened by the plugin
 * - built-in: our own diff page, drawn by the webview
 *
 * A choice of surface rather than a yes/no about the IDE, because the two are
 * not opposites everywhere: a browser has no IDE to say no to, so the question
 * "may we use the IDE's" has no true answer there while "which one" always does.
 * Naming the surfaces also leaves room for ones we have not built yet.
 *
 * Shared because both sides decide on it — the webview to render the setting,
 * the backend to choose whether to ask the IDE to open a diff at all.
 */
export enum DiffSurface {
  IDE = 'ide',
  BUILT_IN = 'built-in',
}

/**
 * How the built-in diff page appears in a browser:
 * - new-tab: its own browser tab, opened the way sessions and settings are
 * - overlay: a modal over the current session, which keeps it mounted
 *
 * Browser-only. In an IDE the built-in diff opens as an editor tab, which is
 * neither of these and is not configurable.
 */
export enum BrowserDiffPresentation {
  NEW_TAB = 'new-tab',
  OVERLAY = 'overlay',
}

/** Every accepted {@link DiffSurface} value, for validating what was stored. */
export const DIFF_SURFACES: readonly string[] = Object.values(DiffSurface);

/** Every accepted {@link BrowserDiffPresentation} value. */
export const BROWSER_DIFF_PRESENTATIONS: readonly string[] =
  Object.values(BrowserDiffPresentation);

/** Where a review is drawn, once every condition has been taken into account. */
export enum ReviewTarget {
  /** The IDE's own diff viewer, opened over the bridge. */
  IDE_VIEWER = 'ide-viewer',
  /** Our diff page in an IDE editor tab, which only the IDE side can open. */
  BUILT_IN_TAB = 'built-in-tab',
  /** Our diff page drawn over the chat, which the webview mounts itself. */
  BUILT_IN_OVERLAY = 'built-in-overlay',
  /** Our diff page in a browser tab or window. */
  BUILT_IN_WINDOW = 'built-in-window',
}

/** Everything the choice of target depends on. */
export interface ReviewTargetInputs {
  /** The `diffSurface` setting, merged for the session's working directory. */
  diffSurface?: string;
  /** The `browserDiffPresentation` setting, merged the same way. */
  browserDiffPresentation?: string;
  /** The `hostMode` setting, which says whether the chat has room for an overlay. */
  hostMode?: string;
  /** Whether an IDE is hosting the backend at all. */
  ideAttached: boolean;
}

/**
 * Which surface draws a review, decided in one place for every caller.
 *
 * Every caller asks this function rather than reading the settings itself.
 * Deciding it twice is what put two reviews of the same edit on screen at once:
 * the backend chose the IDE viewer from the session's merged settings while the
 * webview chose the built-in one from settings it had loaded without a working
 * directory, so the file-name link opened a second review beside the first
 * (#359).
 *
 * Reading the same values in two places is not enough to keep them in step —
 * that was tried, and the two still had different inputs. Only one of them can
 * hold the answer, and it has to be the side that knows which session the
 * review belongs to, because the working directory is what makes a project's
 * setting apply.
 */
export function resolveReviewTarget(inputs: ReviewTargetInputs): ReviewTarget {
  // Naming the IDE cannot conjure one. Every host can draw the built-in page,
  // so it is the answer whenever there is no IDE to honour the preference with.
  if (!inputs.ideAttached) {
    return inputs.browserDiffPresentation === BrowserDiffPresentation.OVERLAY
      ? ReviewTarget.BUILT_IN_OVERLAY
      : ReviewTarget.BUILT_IN_WINDOW;
  }

  // Absent reads as the IDE, which is the default and the behaviour that shipped.
  const surface = inputs.diffSurface ?? DiffSurface.IDE;
  if (surface === DiffSurface.IDE) return ReviewTarget.IDE_VIEWER;

  // An overlay inherits the space of whatever it covers, and a sidebar chat is
  // a column: a side-by-side diff laid over one would be unreadable in the very
  // surface it is meant to be read in. Absent hostMode reads as the editor tab,
  // which is what the settings file itself falls back to.
  const wantsOverlay = inputs.browserDiffPresentation === BrowserDiffPresentation.OVERLAY;
  const hasRoom = (inputs.hostMode ?? 'editor-tab') === 'editor-tab';
  if (wantsOverlay && hasRoom) return ReviewTarget.BUILT_IN_OVERLAY;

  return ReviewTarget.BUILT_IN_TAB;
}
