/**
 * Tells a paste made with the middle mouse button apart from one made with the
 * keyboard or a menu.
 *
 * On Linux a middle click pastes the PRIMARY selection (whatever is selected), not
 * the clipboard, and the paste event it fires looks like any other. A paste checked
 * against the host's clipboard then replaced the selected text with the copied one
 * (#754), so the pastes that consult the host ask here which buffer is meant.
 */

/** `MouseEvent.button` for the middle button. */
const MIDDLE_BUTTON = 1;

/**
 * How long after the middle button was pressed or released a paste still belongs to
 * it. The browser pastes as part of that same click; the margin only covers a slow
 * machine, and a menu paste long after a middle click is not mistaken for it.
 */
const MIDDLE_CLICK_PASTE_MS = 1_000;

/** When the middle button was last pressed or released, or null when no paste can be its. */
let middleClickAt: number | null = null;

/** Watch the page for middle clicks. Returns the function that stops watching. */
export function watchMiddleClicks(doc: Document): () => void {
  // Capture, so the click is noted before the browser pastes and before anything
  // on the way can stop the event.
  const onButton = (event: MouseEvent) => {
    middleClickAt = event.button === MIDDLE_BUTTON ? Date.now() : null;
  };
  // A paste from the keyboard is never the middle button's.
  const onKey = () => {
    middleClickAt = null;
  };
  doc.addEventListener('mousedown', onButton, true);
  doc.addEventListener('mouseup', onButton, true);
  doc.addEventListener('keydown', onKey, true);
  return () => {
    doc.removeEventListener('mousedown', onButton, true);
    doc.removeEventListener('mouseup', onButton, true);
    doc.removeEventListener('keydown', onKey, true);
    middleClickAt = null;
  };
}

/**
 * Whether the paste being handled right now came from the middle button. One click
 * pastes once, so asking uses it up.
 */
export function takeMiddleClickPaste(): boolean {
  const at = middleClickAt;
  middleClickAt = null;
  return at !== null && Date.now() - at <= MIDDLE_CLICK_PASTE_MS;
}
