/**
 * Whether an event landed somewhere characters are meant to go.
 *
 * Reads the composed path rather than `event.target`, because an editable can
 * live inside a shadow root — the review diff's proposed side does — and the
 * platform retargets `target` to the host element. A digit typed into a
 * proposed edit then looked like a digit pressed at the approval panel and
 * picked an option instead of reaching the text (issue #305). The path still
 * holds the real element.
 *
 * `contenteditable` counts for the same reason a textarea does. The attribute
 * is read as well as the resolved property: jsdom does not implement
 * `isContentEditable`, and the renderer marks its editable side with the
 * attribute either way. `contenteditable="false"` is explicitly not editable,
 * which is why the attribute's value is checked rather than its presence.
 */
export function isTypingTarget(event: { composedPath?: () => EventTarget[]; target: EventTarget | null }): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return true;
    const attr = node.getAttribute('contenteditable');
    if (attr !== null && attr !== 'false') return true;
    if (node.isContentEditable) return true;
  }
  return false;
}

/**
 * The element characters would land in, or null when the event did not land in
 * one. Same rules as {@link isTypingTarget}, which is written in terms of this.
 */
export function typingTargetOf(event: { composedPath?: () => EventTarget[]; target: EventTarget | null }): HTMLElement | null {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  for (const node of path) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') return node;
    const attr = node.getAttribute('contenteditable');
    if (attr !== null && attr !== 'false') return node;
    if (node.isContentEditable) return node;
  }
  return null;
}
