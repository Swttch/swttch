/**
 * DOM Selection utilities for contentEditable plain-text offset mapping.
 *
 * Splits into two layers:
 *
 * Layer A — Pure tree mapping (no window.getSelection):
 *   Converts between a plain-text character offset (relative to root.textContent)
 *   and a {node, offset} DOM point. Fully unit-testable in jsdom.
 *
 * Layer B — Selection wrappers (uses window.getSelection):
 *   Uses Layer A internally. Assumes root is focused and in the document.
 *   jsdom support is limited; safe fallbacks are provided for missing APIs.
 */

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

/** A cursor position in the DOM tree: a (node, offset-within-node) pair. */
export interface DomPoint {
  node: Node;
  offset: number;
}

/** A selection range expressed as plain-text offsets relative to a root element. */
export interface TextRange {
  start: number;
  end: number;
}

// ---------------------------------------------------------------------------
// Layer A — Pure tree mapping
// ---------------------------------------------------------------------------

/**
 * Collect all Text nodes under `root` in depth-first order.
 */
function collectTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current !== null) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

/**
 * Convert a plain-text `offset` (0-based, relative to `root.textContent`) to a
 * DOM {node, offset} point.
 *
 * - Traverses text nodes depth-first, accumulating lengths.
 * - Clamps to the last valid position if `offset` exceeds total length.
 * - Returns {node: root, offset: 0} when there are no text nodes (empty element).
 */
export function textOffsetToPoint(root: HTMLElement, offset: number): DomPoint {
  const textNodes = collectTextNodes(root);

  if (textNodes.length === 0) {
    return { node: root, offset: 0 };
  }

  let accumulated = 0;
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    const len = node.length;
    const isLast = i === textNodes.length - 1;

    // offset falls strictly within this text node
    if (offset < accumulated + len) {
      return { node, offset: offset - accumulated };
    }

    // offset equals the end of this text node: prefer placing it at the
    // *start* of the next text node so that moving one character forward
    // crosses the node boundary cleanly — but only if a next node exists.
    if (offset === accumulated + len && !isLast) {
      return { node: textNodes[i + 1], offset: 0 };
    }

    // Last node (or past all nodes): clamp to end
    if (isLast) {
      const nodeOffset = Math.max(0, Math.min(offset - accumulated, len));
      return { node, offset: nodeOffset };
    }

    accumulated += len;
  }

  // Should not reach here, but satisfy the compiler
  const last = textNodes[textNodes.length - 1];
  return { node: last, offset: last.length };
}

/**
 * Convert a DOM {node, nodeOffset} point back to a plain-text offset relative
 * to `root.textContent`.
 *
 * - If `node` is a Text node: sum lengths of all preceding text nodes + nodeOffset.
 * - If `node` is an Element: sum lengths of text nodes that come before `node`
 *   in document order (nodeOffset is treated as a child-index boundary, but for
 *   plain-text purposes we just count the text accumulated up to that element).
 * - Returns 0 for the root itself with any offset.
 */
export function pointToTextOffset(
  root: HTMLElement,
  node: Node,
  nodeOffset: number,
): number {
  // root element with offset 0 → start of content
  if (node === root) {
    return 0;
  }

  const textNodes = collectTextNodes(root);

  if (node.nodeType === Node.TEXT_NODE) {
    let accumulated = 0;
    for (const tn of textNodes) {
      if (tn === node) {
        return accumulated + Math.min(nodeOffset, tn.length);
      }
      accumulated += tn.length;
    }
    // node not found inside root — return 0
    return 0;
  }

  // Element node: find how many text-node characters precede this element
  // by walking the tree and stopping when we reach `node` (or its subtree).
  let accumulated = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let current: Node | null = walker.nextNode();
  while (current !== null) {
    if (current === node) {
      break;
    }
    if (current.nodeType === Node.TEXT_NODE) {
      accumulated += (current as Text).length;
    }
    current = walker.nextNode();
  }
  return accumulated;
}

// ---------------------------------------------------------------------------
// Layer B — Selection wrappers
// ---------------------------------------------------------------------------

/**
 * Return the current caret (focus) position as a plain-text offset relative to
 * `root.textContent`. Returns 0 if there is no selection or the selection is
 * outside `root`.
 */
export function getCaretOffset(root: HTMLElement): number {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;

  const focusNode = selection.focusNode;
  if (focusNode === null || !root.contains(focusNode)) return 0;

  // Use focus point for caret position
  try {
    return pointToTextOffset(root, focusNode, selection.focusOffset);
  } catch {
    return 0;
  }
}

/**
 * Move the caret to `offset` (plain-text, relative to `root.textContent`).
 * No-op if there is no Selection API or if `root` has no content at that offset.
 */
export function setCaretOffset(root: HTMLElement, offset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  try {
    const point = textOffsetToPoint(root, offset);
    const range = document.createRange();
    range.setStart(point.node, point.offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Silently ignore if DOM is in an unexpected state
  }
}

/**
 * Return the current selection as {start, end} plain-text offsets, with
 * start <= end always. Falls back to {start: 0, end: 0} if there is no
 * selection or the selection is outside `root`.
 */
export function getSelectionRange(root: HTMLElement): TextRange {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return { start: 0, end: 0 };

  const anchorNode = selection.anchorNode;
  const focusNode = selection.focusNode;

  if (
    anchorNode === null ||
    focusNode === null ||
    !root.contains(anchorNode) ||
    !root.contains(focusNode)
  ) {
    return { start: 0, end: 0 };
  }

  try {
    const anchor = pointToTextOffset(root, anchorNode, selection.anchorOffset);
    const focus = pointToTextOffset(root, focusNode, selection.focusOffset);
    return { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
  } catch {
    return { start: 0, end: 0 };
  }
}

/**
 * Set the selection to [start, end] (plain-text offsets, relative to
 * `root.textContent`). Silently ignores errors (e.g., root not in document).
 */
export function setSelectionRange(
  root: HTMLElement,
  start: number,
  end: number,
): void {
  const selection = window.getSelection();
  if (!selection) return;

  try {
    const startPoint = textOffsetToPoint(root, start);
    const endPoint = textOffsetToPoint(root, end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  } catch {
    // Silently ignore if DOM is not attached or in an unexpected state
  }
}
