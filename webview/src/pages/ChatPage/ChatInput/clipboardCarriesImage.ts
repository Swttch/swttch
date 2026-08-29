/**
 * Whether a paste carries an image file, which the composer handles itself
 * (turning it into an attachment) rather than letting it reach the editor.
 *
 * This is the composer's ONLY reason to intercept a paste. Text is deliberately
 * left to the browser (issue #286): the editor is
 * `contentEditable="plaintext-only"`, so the browser already drops rich markup,
 * and cancelling the event to write the text ourselves would skip the browser's
 * undo stack, making Cmd/Ctrl+Z unable to undo a paste even though text typed
 * afterwards undid normally.
 *
 * Keep this predicate free of side effects: it decides, the caller acts.
 */
export function clipboardCarriesImage(clipboardData: DataTransfer | null): boolean {
  const items = clipboardData?.items;
  if (!items) return false;
  return Array.from(items).some(
    item => item.kind === 'file' && item.type.startsWith('image/'),
  );
}
