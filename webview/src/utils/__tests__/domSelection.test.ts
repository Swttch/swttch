import { describe, it, expect, beforeEach } from 'vitest';
import {
  textOffsetToPoint,
  pointToTextOffset,
  getCaretOffset,
  setCaretOffset,
  getSelectionRange,
  setSelectionRange,
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
