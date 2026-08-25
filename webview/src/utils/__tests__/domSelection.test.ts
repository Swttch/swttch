import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  textOffsetToPoint,
  pointToTextOffset,
  getCaretOffset,
  setCaretOffset,
  getSelectionRange,
  setSelectionRange,
  moveCaretToBoundary,
  CaretBoundary,
  CaretDirection,
} from '../domSelection';

// jsdom is available via vitest's jsdom environment.
// Selection API in jsdom is limited (addRange / getSelection work for basic cases),
// so layer B (getCaretOffset, setCaretOffset, getSelectionRange, setSelectionRange)
// tests are kept shallow — they just verify the functions exist and don't throw.

function makeDiv(...children: (string | HTMLElement)[]): HTMLDivElement {
  const div = document.createElement('div');
  for (const child of children) {
    if (typeof child === 'string') {
      div.appendChild(document.createTextNode(child));
    } else {
      div.appendChild(child);
    }
  }
  return div;
}

// ---------------------------------------------------------------------------
// Layer A — textOffsetToPoint
// ---------------------------------------------------------------------------

describe('textOffsetToPoint', () => {
  describe('single textNode', () => {
    let root: HTMLDivElement;
    let textNode: Text;

    beforeEach(() => {
      root = document.createElement('div');
      textNode = document.createTextNode('hello');
      root.appendChild(textNode);
    });

    it('offset 0 → {node: textNode, offset: 0}', () => {
      const result = textOffsetToPoint(root, 0);
      expect(result.node).toBe(textNode);
      expect(result.offset).toBe(0);
    });

    it('offset 2 → {node: textNode, offset: 2}', () => {
      const result = textOffsetToPoint(root, 2);
      expect(result.node).toBe(textNode);
      expect(result.offset).toBe(2);
    });

    it('offset 5 (end) → {node: textNode, offset: 5}', () => {
      const result = textOffsetToPoint(root, 5);
      expect(result.node).toBe(textNode);
      expect(result.offset).toBe(5);
    });

    it('offset exceeding length → clamp to last position', () => {
      const result = textOffsetToPoint(root, 100);
      expect(result.node).toBe(textNode);
      expect(result.offset).toBe(5);
    });
  });

  describe('empty div (no textNodes)', () => {
    it('offset 0 → {node: root, offset: 0}', () => {
      const root = document.createElement('div');
      const result = textOffsetToPoint(root, 0);
      expect(result.node).toBe(root);
      expect(result.offset).toBe(0);
    });

    it('any positive offset on empty div → {node: root, offset: 0}', () => {
      const root = document.createElement('div');
      const result = textOffsetToPoint(root, 5);
      expect(result.node).toBe(root);
      expect(result.offset).toBe(0);
    });
  });

  describe('multiple textNodes across child elements', () => {
    // Structure: <div><span>ab</span>cd</div>
    // textNodes: ["ab"(span child), "cd"(div direct child)]
    // global offsets: 0-1 → "ab", 2-3 → "cd"
    let root: HTMLDivElement;
    let abNode: Text;
    let cdNode: Text;

    beforeEach(() => {
      root = document.createElement('div');
      const span = document.createElement('span');
      abNode = document.createTextNode('ab');
      span.appendChild(abNode);
      cdNode = document.createTextNode('cd');
      root.appendChild(span);
      root.appendChild(cdNode);
    });

    it('offset 0 → first textNode "ab", offset 0', () => {
      const result = textOffsetToPoint(root, 0);
      expect(result.node).toBe(abNode);
      expect(result.offset).toBe(0);
    });

    it('offset 1 → first textNode "ab", offset 1', () => {
      const result = textOffsetToPoint(root, 1);
      expect(result.node).toBe(abNode);
      expect(result.offset).toBe(1);
    });

    it('offset 2 → second textNode "cd", offset 0', () => {
      const result = textOffsetToPoint(root, 2);
      expect(result.node).toBe(cdNode);
      expect(result.offset).toBe(0);
    });

    it('offset 3 → second textNode "cd", offset 1', () => {
      const result = textOffsetToPoint(root, 3);
      expect(result.node).toBe(cdNode);
      expect(result.offset).toBe(1);
    });

    it('offset 4 (total length) → clamp to last textNode end', () => {
      const result = textOffsetToPoint(root, 4);
      expect(result.node).toBe(cdNode);
      expect(result.offset).toBe(2);
    });

    it('offset beyond total → clamp', () => {
      const result = textOffsetToPoint(root, 999);
      expect(result.node).toBe(cdNode);
      expect(result.offset).toBe(2);
    });
  });

  describe('deeply nested structure', () => {
    // <div><p><span>foo</span></p><p>bar</p></div>
    // textContent = "foobar", offsets 0-2→foo, 3-5→bar
    let root: HTMLDivElement;
    let fooNode: Text;
    let barNode: Text;

    beforeEach(() => {
      root = document.createElement('div');
      const p1 = document.createElement('p');
      const span = document.createElement('span');
      fooNode = document.createTextNode('foo');
      span.appendChild(fooNode);
      p1.appendChild(span);
      const p2 = document.createElement('p');
      barNode = document.createTextNode('bar');
      p2.appendChild(barNode);
      root.appendChild(p1);
      root.appendChild(p2);
    });

    it('offset 0 → fooNode, 0', () => {
      const result = textOffsetToPoint(root, 0);
      expect(result.node).toBe(fooNode);
      expect(result.offset).toBe(0);
    });

    it('offset 2 → fooNode, 2', () => {
      const result = textOffsetToPoint(root, 2);
      expect(result.node).toBe(fooNode);
      expect(result.offset).toBe(2);
    });

    it('offset 3 → barNode, 0', () => {
      const result = textOffsetToPoint(root, 3);
      expect(result.node).toBe(barNode);
      expect(result.offset).toBe(0);
    });

    it('offset 5 → barNode, 2', () => {
      const result = textOffsetToPoint(root, 5);
      expect(result.node).toBe(barNode);
      expect(result.offset).toBe(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Layer A — pointToTextOffset
// ---------------------------------------------------------------------------

describe('pointToTextOffset', () => {
  describe('single textNode', () => {
    let root: HTMLDivElement;
    let textNode: Text;

    beforeEach(() => {
      root = document.createElement('div');
      textNode = document.createTextNode('hello');
      root.appendChild(textNode);
    });

    it('(textNode, 0) → 0', () => {
      expect(pointToTextOffset(root, textNode, 0)).toBe(0);
    });

    it('(textNode, 3) → 3', () => {
      expect(pointToTextOffset(root, textNode, 3)).toBe(3);
    });

    it('(textNode, 5) → 5', () => {
      expect(pointToTextOffset(root, textNode, 5)).toBe(5);
    });
  });

  describe('empty div', () => {
    it('(root, 0) on empty div → 0', () => {
      const root = document.createElement('div');
      expect(pointToTextOffset(root, root, 0)).toBe(0);
    });
  });

  describe('multiple textNodes', () => {
    // <div><span>ab</span>cd</div>
    let root: HTMLDivElement;
    let abNode: Text;
    let cdNode: Text;

    beforeEach(() => {
      root = document.createElement('div');
      const span = document.createElement('span');
      abNode = document.createTextNode('ab');
      span.appendChild(abNode);
      cdNode = document.createTextNode('cd');
      root.appendChild(span);
      root.appendChild(cdNode);
    });

    it('(abNode, 0) → 0', () => {
      expect(pointToTextOffset(root, abNode, 0)).toBe(0);
    });

    it('(abNode, 1) → 1', () => {
      expect(pointToTextOffset(root, abNode, 1)).toBe(1);
    });

    it('(cdNode, 0) → 2', () => {
      expect(pointToTextOffset(root, cdNode, 0)).toBe(2);
    });

    it('(cdNode, 1) → 3', () => {
      expect(pointToTextOffset(root, cdNode, 1)).toBe(3);
    });

    it('(cdNode, 2) → 4', () => {
      expect(pointToTextOffset(root, cdNode, 2)).toBe(4);
    });

    it('element node as anchor → offset equals preceding text length', () => {
      // passing root itself as the "node" with childIndex 0 → before first child
      // This simulates a Selection that lands on an element node rather than text
      const span = root.firstElementChild!;
      // pointToTextOffset with element node: text accumulated before span = 0
      expect(pointToTextOffset(root, span, 0)).toBe(0);
    });
  });

  describe('round-trip: textOffsetToPoint → pointToTextOffset', () => {
    // <div><span>ab</span>cd</div>, total length 4
    let root: HTMLDivElement;

    beforeEach(() => {
      root = document.createElement('div');
      const span = document.createElement('span');
      span.appendChild(document.createTextNode('ab'));
      root.appendChild(span);
      root.appendChild(document.createTextNode('cd'));
    });

    it.each([0, 1, 2, 3, 4])('round-trip for offset %i', (offset) => {
      const point = textOffsetToPoint(root, offset);
      const restored = pointToTextOffset(root, point.node, point.offset);
      expect(restored).toBe(offset);
    });
  });

  describe('round-trip: deeply nested', () => {
    // <div><p><span>foo</span></p><p>bar</p></div>, total length 6
    let root: HTMLDivElement;

    beforeEach(() => {
      root = document.createElement('div');
      const p1 = document.createElement('p');
      const span = document.createElement('span');
      span.appendChild(document.createTextNode('foo'));
      p1.appendChild(span);
      const p2 = document.createElement('p');
      p2.appendChild(document.createTextNode('bar'));
      root.appendChild(p1);
      root.appendChild(p2);
    });

    it.each([0, 1, 2, 3, 4, 5, 6])('round-trip for offset %i', (offset) => {
      const point = textOffsetToPoint(root, offset);
      const restored = pointToTextOffset(root, point.node, point.offset);
      expect(restored).toBe(offset);
    });
  });
});

// ---------------------------------------------------------------------------
// Layer B — Selection wrapper (shallow smoke tests, jsdom limitation aware)
// ---------------------------------------------------------------------------

describe('Layer B Selection wrappers (smoke tests)', () => {
  it('exports getCaretOffset as a function', () => {
    expect(typeof getCaretOffset).toBe('function');
  });

  it('exports setCaretOffset as a function', () => {
    expect(typeof setCaretOffset).toBe('function');
  });

  it('exports getSelectionRange as a function', () => {
    expect(typeof getSelectionRange).toBe('function');
  });

  it('exports setSelectionRange as a function', () => {
    expect(typeof setSelectionRange).toBe('function');
  });

  it('getCaretOffset returns 0 when no selection exists', () => {
    // jsdom: getSelection() returns a Selection object but with no ranges
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    // Clear any existing selection
    window.getSelection()?.removeAllRanges();
    const offset = getCaretOffset(root);
    expect(offset).toBe(0);
    document.body.removeChild(root);
  });

  it('setCaretOffset does not throw even on empty div', () => {
    const root = makeDiv();
    document.body.appendChild(root);
    expect(() => setCaretOffset(root, 0)).not.toThrow();
    document.body.removeChild(root);
  });

  it('getSelectionRange returns {start:0, end:0} when no selection', () => {
    const root = makeDiv('hello');
    document.body.appendChild(root);
    window.getSelection()?.removeAllRanges();
    const range = getSelectionRange(root);
    expect(range.start).toBe(0);
    expect(range.end).toBe(0);
    document.body.removeChild(root);
  });

  it('setSelectionRange does not throw', () => {
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    expect(() => setSelectionRange(root, 0, 5)).not.toThrow();
    document.body.removeChild(root);
  });

  it('setCaretOffset + getCaretOffset round-trip on a div with text', () => {
    const root = makeDiv('hello');
    document.body.appendChild(root);

    setCaretOffset(root, 3);
    const offset = getCaretOffset(root);
    // jsdom selection support is limited; just verify no exception and offset is a number
    expect(typeof offset).toBe('number');
    expect(offset).toBeGreaterThanOrEqual(0);

    document.body.removeChild(root);
  });

  it('setSelectionRange for out-of-root selection does not throw', () => {
    const root = makeDiv('hello');
    // Don't attach to body — simulates out-of-document element
    // Should not throw
    expect(() => setSelectionRange(root, 0, 3)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Caret scrolling
// ---------------------------------------------------------------------------

/**
 * Moving the caret through the Selection API does not scroll the box — the
 * browser only does that for a move it performed itself. So a paste, a history
 * recall or any programmatic jump would leave the caret off-screen with the
 * view still parked where it was.
 *
 * jsdom lays nothing out, so the scroll cannot be observed for real. Stubbing
 * the two rects the logic reads makes the decision itself testable: does it
 * scroll up when the caret sits above the visible box, down when below, and
 * stay put when the caret is already inside.
 */
describe('caret scrolling on programmatic moves', () => {
  /**
   * Give `root` a fixed viewport box and force every Range inside it to report
   * `caretTop`, so the caret can be placed above, below or within the box.
   */
  function stubLayout(root: HTMLElement, box: { top: number; bottom: number }, caretTop: number) {
    root.getBoundingClientRect = () =>
      ({ top: box.top, bottom: box.bottom, height: box.bottom - box.top, width: 300 }) as DOMRect;
    const caretRect = {
      top: caretTop,
      bottom: caretTop + 20,
      height: 20,
      width: 0,
    } as DOMRect;
    Range.prototype.getClientRects = () => [caretRect] as unknown as DOMRectList;
    Range.prototype.getBoundingClientRect = () => caretRect;
  }

  const originalRects = Range.prototype.getClientRects;
  const originalBounding = Range.prototype.getBoundingClientRect;
  afterEach(() => {
    Range.prototype.getClientRects = originalRects;
    Range.prototype.getBoundingClientRect = originalBounding;
  });

  it('scrolls up when the caret sits above the visible box', () => {
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    // Box spans 100..300; caret is 40px above its top edge.
    stubLayout(root, { top: 100, bottom: 300 }, 60);
    root.scrollTop = 500;

    setCaretOffset(root, 3);

    expect(root.scrollTop).toBe(460);
    document.body.removeChild(root);
  });

  it('scrolls down when the caret sits below the visible box', () => {
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    // Caret's bottom (350+20) overshoots the box's bottom (300) by 70.
    stubLayout(root, { top: 100, bottom: 300 }, 350);
    root.scrollTop = 0;

    setCaretOffset(root, 3);

    expect(root.scrollTop).toBe(70);
    document.body.removeChild(root);
  });

  it('leaves the scroll alone when the caret is already visible', () => {
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    stubLayout(root, { top: 100, bottom: 300 }, 150);
    root.scrollTop = 42;

    setCaretOffset(root, 3);

    expect(root.scrollTop).toBe(42);
    document.body.removeChild(root);
  });

  it('follows the end of a selection, not its start', () => {
    // The caret rests at the end of a selection, so that is what must be
    // brought into view — scrolling to the start would strand it.
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    stubLayout(root, { top: 100, bottom: 300 }, 350);
    root.scrollTop = 0;

    setSelectionRange(root, 0, 5);

    expect(root.scrollTop).toBe(70);
    document.body.removeChild(root);
  });

  it('does nothing where the environment reports no layout', () => {
    // Guards the jsdom/headless path: an all-zero root rect must not be read as
    // "the caret is out of view" and trigger a bogus scroll.
    const root = makeDiv('hello world');
    document.body.appendChild(root);
    root.getBoundingClientRect = () =>
      ({ top: 0, bottom: 0, height: 0, width: 0 }) as DOMRect;
    root.scrollTop = 17;

    setCaretOffset(root, 3);

    expect(root.scrollTop).toBe(17);
    document.body.removeChild(root);
  });
});

// ---------------------------------------------------------------------------
// moveCaretToBoundary
// ---------------------------------------------------------------------------

/**
 * These assert the granularity handed to `Selection.modify`, which is the whole
 * of what this function decides. jsdom does not implement `modify` (nor any
 * layout to observe a caret with), so it is stubbed and the call is read back.
 *
 * The granularity is the part worth pinning: 'lineboundary' follows a soft wrap
 * to the edge of the visual row, while the implementation this replaced scanned
 * for "\n" and so ran on to the end of the paragraph. A test that only checked
 * "the caret moved" would pass for both.
 */
describe('moveCaretToBoundary', () => {
  let modify: ReturnType<typeof vi.fn>;
  let originalGetSelection: typeof window.getSelection;

  beforeEach(() => {
    modify = vi.fn();
    originalGetSelection = window.getSelection;
    window.getSelection = () => ({ modify, rangeCount: 0 }) as unknown as Selection;
  });

  afterEach(() => {
    window.getSelection = originalGetSelection;
  });

  const root = () => document.createElement('div');

  it('moves to the edge of the visual line, not of the paragraph', () => {
    moveCaretToBoundary(root(), CaretDirection.Backward, CaretBoundary.Line, false);

    expect(modify).toHaveBeenCalledWith('move', 'backward', 'lineboundary');
  });

  it('extends the selection instead of moving it when Shift is held', () => {
    moveCaretToBoundary(root(), CaretDirection.Forward, CaretBoundary.Line, true);

    expect(modify).toHaveBeenCalledWith('extend', 'forward', 'lineboundary');
  });

  it('reaches the whole text for the vertical arrows', () => {
    moveCaretToBoundary(root(), CaretDirection.Forward, CaretBoundary.Document, false);

    expect(modify).toHaveBeenCalledWith('move', 'forward', 'documentboundary');
  });

  it('does nothing where the engine has no modify()', () => {
    window.getSelection = () => ({ rangeCount: 0 }) as unknown as Selection;

    // The caret staying put is the wanted outcome: without `modify` there is no
    // way to find a visual line's edge, and guessing one would move it wrongly.
    expect(() =>
      moveCaretToBoundary(root(), CaretDirection.Backward, CaretBoundary.Line, false),
    ).not.toThrow();
  });
});
