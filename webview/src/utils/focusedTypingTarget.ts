import { typingTargetOf } from './typingTarget';

/**
 * The focused element, followed into shadow roots: `document.activeElement`
 * stops at a shadow host, and the editable can be inside it (the review diff's
 * proposed side is).
 */
export function deepActiveElement(): Element | null {
  let active = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active;
}

/**
 * The editable that has focus right now, or null when focus is not in one.
 * For commands that arrive over the bridge rather than as a DOM event, so
 * there is no event path to read and focus is the only thing that says where
 * the command belongs.
 */
export function focusedTypingTarget(): HTMLElement | null {
  return typingTargetOf({ target: deepActiveElement() });
}
