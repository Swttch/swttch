import { selectedText } from '../selection/selectedText';
import { selectedHtml } from '../selection/selectedHtml';

/**
 * Puts [text] and [html] into a copy event as the clipboard's own content, in place of what the browser
 * would have written (#648). The browser's copy of a code block runs its lines together and loses the
 * spaces when pasted into a program that reads formatting; this HTML does not (see [selectedHtml]).
 *
 * Only a copy is taken over. A cut also has to remove the selection, which the browser does only for its
 * own default action. Nothing is written without HTML: a selection in a text field has none, and its
 * copy stays the browser's.
 */
export function writeFormattedCopy(event: Event, text: string, html: string | undefined): void {
  const data = event.type === 'copy' ? (event as ClipboardEvent).clipboardData : null;
  if (html === undefined || !data) return;
  event.preventDefault();
  data.setData('text/plain', text);
  data.setData('text/html', html);
}

/**
 * Copies in a browser that has no IDE host to report to: the same text and HTML as in the IDE, so a
 * paste reads the same everywhere. Returns the function that puts the page back.
 */
export function attachFormattedCopy(doc: Document): () => void {
  const onCopy = (event: Event) => {
    // Someone already took this copy over and wrote their own content.
    if (event.defaultPrevented) return;
    const text = selectedText(doc);
    if (text.length === 0) return;
    writeFormattedCopy(event, text, selectedHtml(doc));
  };
  doc.addEventListener('copy', onCopy);
  return () => doc.removeEventListener('copy', onCopy);
}
