/**
 * Window event asking the session header to open its ⋮ menu on the dock editor.
 *
 * The dock editor has no route of its own — it is the body of a popover anchored
 * to a button in the session header, so it cannot be navigated to the way a
 * settings page can. The checklist and that header are on different branches of
 * the tree with no shared owner between them, and threading a ref or a context
 * from one to the other would make the header's popover state something the rest
 * of the app can reach into.
 *
 * A window event is what {@link openSettingsAt} already does for the same shape
 * of problem, so this follows it rather than inventing a second mechanism.
 */
export const OPEN_DOCK_EDITOR_EVENT = 'open-dock-editor';

/** Ask the session header to open the dock editor. */
export function openDockEditor(): void {
  window.dispatchEvent(new CustomEvent(OPEN_DOCK_EDITOR_EVENT));
}
