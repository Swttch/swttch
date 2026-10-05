/**
 * Whether a paste reached the composer with nothing on the browser's own
 * clipboard: no file, no text, no markup.
 *
 * This is how a paste looks on a Wayland desktop when the browser cannot see the
 * clipboard (#278). The IDE window is a Wayland window and the embedded browser
 * is a separate X11 process, and the desktop hands the clipboard of the former to
 * programs of the latter only while one of them has the focus. The user copied
 * something, pressed paste, and the event carried nothing, so nothing happened.
 *
 * The composer answers that by asking the host for what is on the clipboard. A
 * clipboard that really is empty gets the same question and the same answer, an
 * empty one, so the paste does nothing, as it would have anyway.
 *
 * A paste whose event is missing is not called empty: with no event there is
 * nothing to compare against, so the browser's own handling is left alone.
 *
 * Keep this predicate free of side effects: it decides, the caller acts.
 */
export function clipboardIsEmpty(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return false;
  if (Array.from(clipboardData.types).includes('Files')) return false;
  return clipboardData.getData('text/plain') === '' && clipboardData.getData('text/html') === '';
}
