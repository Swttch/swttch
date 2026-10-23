/**
 * The text the user has selected in [doc], from a text field or from the page, or
 * '' when there is none.
 *
 * Shared by what reports a selection (#513) and what reports a copy (#581), which
 * both need to know what the user is looking at as selected.
 */
export function selectedText(doc: Document): string {
  const active = doc.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    // Never what was typed into a password field, selected or not.
    if (active instanceof HTMLInputElement && active.type === 'password') return '';
    const { selectionStart, selectionEnd, value } = active;
    if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) {
      return value.slice(selectionStart, selectionEnd);
    }
  }
  return doc.getSelection()?.toString() ?? '';
}
