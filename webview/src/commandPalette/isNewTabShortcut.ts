/**
 * Decides whether a key event is the 'new tab' shortcut (Mod+N).
 *
 * On macOS, Ctrl+N is the native 'next line' key in every text field
 * (issue #506), so only Cmd+N may match there; claiming Ctrl+N would steal the
 * caret key via preventDefault. On Windows/Linux the existing behavior is kept:
 * Ctrl+N or Meta+N both match.
 */
export function isNewTabShortcut(
  e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key'>,
  mac: boolean,
): boolean {
  if (e.key !== 'n') return false;
  return mac ? e.metaKey : e.metaKey || e.ctrlKey;
}
