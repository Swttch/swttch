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
