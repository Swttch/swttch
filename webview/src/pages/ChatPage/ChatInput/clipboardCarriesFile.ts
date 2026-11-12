/**
 * Whether a paste carries a file of any kind, which the composer handles itself
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
export function clipboardCarriesFile(clipboardData: DataTransfer | null): boolean {
  const items = clipboardData?.items;
  if (!items) return false;
  return Array.from(items).some(item => item.kind === 'file');
}

/**
 * Whether a paste carries files and none of them is a picture the composer attaches
 * inline: a spreadsheet, a document or a folder copied in a file manager.
 *
 * In the IDE the page cannot learn such a file's path from the paste, so the composer
 * asks the IDE host for it, which reads the paths off the system clipboard and sends
 * them the way a drop of the same files does. Pictures keep the paste's own bytes.
 *
 * `isInlineImage` is a parameter so this stays a plain function of the event data.
 */
export function clipboardCarriesFileForHost(
  clipboardData: DataTransfer | null,
  isInlineImage: (mimeType: string) => boolean,
): boolean {
  const files = Array.from(clipboardData?.items ?? []).filter(item => item.kind === 'file');
  return files.length > 0 && !files.some(item => isInlineImage(item.type));
}
