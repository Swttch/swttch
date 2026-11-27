import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ZOOM_RECTS_ATTRIBUTE } from '@/utils/zoomRects';
import { entryMarker, SCROLL_UNANCHORED_ATTRIBUTE, useScrollAnchor } from '../useScrollAnchor';

/** Stands in the list for the mark of the stretch the window does not hold. */
const GAP = '(gap)';

/**
 * jsdom lays nothing out, so the transcript is imitated: entries stacked in a scroll container, each with a layout
 * height, and rectangles reported the way a browser reports them under the page zoom. `scrollTop` is always in layout
 * pixels; a rectangle is in screen pixels on a recent Chromium ('scaled') and in layout pixels on an older one.
 */
function transcript(entries: [uuid: string, height: number][], zoom = 1, rects: 'scaled' | 'layout' = 'scaled') {
  document.documentElement.style.zoom = String(zoom);
  document.documentElement.setAttribute(ZOOM_RECTS_ATTRIBUTE, rects);
  const unit = rects === 'scaled' ? zoom : 1;

  const container = document.createElement('div');
  document.body.append(container);
  let top = 0;
  Object.defineProperty(container, 'scrollTop', { get: () => top, set: (v: number) => (top = v) });
  container.getBoundingClientRect = () => ({ top: 0, bottom: 500 * unit }) as DOMRect;

  let list = entries;
  const nodeFor = (uuid: string) => {
    const node = document.createElement('div');
    const marks = uuid === GAP ? { 'data-window-gap': '' } : entryMarker(uuid);
    for (const [name, value] of Object.entries(marks)) node.setAttribute(name, value);
    node.getBoundingClientRect = () => {
      let above = 0;
      for (const child of Array.from(container.children)) {
        if (child === node) break;
        above += list[Array.from(container.children).indexOf(child)][1];
      }
      const height = list[Array.from(container.children).indexOf(node)][1];
      return { top: (above - top) * unit, bottom: (above + height - top) * unit } as DOMRect;
    };
    return node;
  };
  const draw = () => {
    container.innerHTML = '';
    for (const [uuid] of list) container.append(nodeFor(uuid));
  };
  draw();

  const view = renderHook(() => useScrollAnchor({ current: container }));
  return {
    anchor: view.result.current,
    container,
    scrollTo: (value: number) => (top = value),
    /** Where the entry's top edge is below the container's, in layout pixels. */
    offsetOf: (uuid: string) => {
      const node = container.querySelector<HTMLElement>(`[data-entry-uuid="${uuid}"]`)!;
      return node.getBoundingClientRect().top / unit;
    },
    redraw: (next: [string, number][]) => {
      list = next;
      draw();
    },
    /** A new entry in front of the one at `index`. The entries already drawn stay the elements they were. */
    insert: (index: number, entry: [string, number]) => {
      const before = container.children[index] ?? null;
      list = [...list.slice(0, index), entry, ...list.slice(index)];
      container.insertBefore(nodeFor(entry[0]), before);
    },
    /** An entry already drawn gets taller where it stands. */
    resize: (index: number, height: number) => {
      list = list.map((entry, i) => (i === index ? [entry[0], height] : entry));
    },
    /** Where the element at `index` has its top edge below the container's, in layout pixels. */
    offsetAt: (index: number) => container.children[index].getBoundingClientRect().top / unit,
  };
}

afterEach(() => {
  document.documentElement.style.zoom = '';
  document.documentElement.removeAttribute(ZOOM_RECTS_ATTRIBUTE);
  document.body.innerHTML = '';
});

const HELD: [string, number][] = [['a', 100], ['b', 100], ['c', 100]];
const OLDER: [string, number][] = [['x', 400], ['y', 200]];

describe('useScrollAnchor: an older page lands in front', () => {
  it.each([
    [1, 'scaled'],
    [1.25, 'scaled'],
    [2, 'scaled'],
    [1.25, 'layout'],
    [0.9, 'layout'],
  ] as const)('keeps the entry where it was at zoom %s with %s rectangles', (zoom, rects) => {
    const page = transcript(HELD, zoom, rects);
    page.scrollTo(30);
    page.anchor.capture();

    page.redraw([...OLDER, ...HELD]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetOf('a')).toBeCloseTo(-30);
    expect(page.container.scrollTop).toBeCloseTo(630);
  });
});

describe('useScrollAnchor: the noted entry is not drawn any more', () => {
  // A page of the window can begin with a tool result whose call is on the page before it. When that page arrives
  // the result is folded into its call, and the entry that was first on the screen is no longer drawn at all.
  it('holds the next entry that was on the screen', () => {
    const page = transcript(HELD, 1.25);
    page.anchor.capture();

    page.redraw([...OLDER, ['b', 100], ['c', 100]]);
    expect(page.anchor.restore()).toBe(true);

    // b was 100 below the top edge.
    expect(page.offsetOf('b')).toBeCloseTo(100);
  });

  it('passes over an entry that is now drawn twice', () => {
    const page = transcript(HELD);
    page.anchor.capture();

    page.redraw([...OLDER, ['a', 100], ['a', 100], ['b', 100], ['c', 100]]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetOf('b')).toBeCloseTo(100);
  });

  // An entry can draw nothing (a result folded into its call) and still have its marker. Where such a row stands
  // says nothing about what the reader sees: here it ends up on the other side of the line that went away.
  it('does not hold on to an entry that draws nothing', () => {
    const page = transcript([['empty', 0], ['run', 49], ['empty-2', 0], ['text', 100]]);
    page.scrollTo(-20);
    page.anchor.capture();

    // The run of calls joins the one on the older page: its line is not drawn here any more.
    page.redraw([...OLDER, ['empty', 0], ['empty-2', 0], ['text', 100]]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetOf('text')).toBeCloseTo(69);
  });

  // A send pinned to the top of the classic chat stays there however far its reply is scrolled, so where it is drawn
  // says nothing about where the reader is. Held on to, an older page put the reader back at the start of that reply.
  it('does not hold on to a pinned send', () => {
    const page = transcript([['send', 40], ['one', 100], ['two', 100]]);
    page.scrollTo(150);
    const send = page.container.querySelector<HTMLElement>('[data-entry-uuid="send"]')!;
    const pinned = document.createElement('div');
    pinned.setAttribute(SCROLL_UNANCHORED_ATTRIBUTE, '');
    // Stuck to the top edge, wherever the page is scrolled to.
    pinned.append(send.cloneNode(true));
    (pinned.firstElementChild as HTMLElement).getBoundingClientRect = () => ({ top: 0, bottom: 40 }) as DOMRect;
    pinned.getBoundingClientRect = () => ({ top: 0, bottom: 40 }) as DOMRect;
    send.removeAttribute('data-entry-uuid');
    send.append(pinned);
    page.anchor.capture();

    page.redraw([...OLDER, ['send', 40], ['one', 100], ['two', 100]]);
    expect(page.anchor.restore()).toBe(true);

    // 'two' was being read, 10 above the top edge.
    expect(page.offsetOf('two')).toBeCloseTo(-10);
  });

  it('says so, and leaves the view alone, when none of them is drawn', () => {
    const page = transcript(HELD);
    page.scrollTo(30);
    page.anchor.capture();

    page.redraw(OLDER);
    expect(page.anchor.restore()).toBe(false);
    expect(page.container.scrollTop).toBe(30);
  });
});

describe('useScrollAnchor: an entry cut off by the top edge changes inside', () => {
  // A jump leaves the send it went to a little below the top edge, with the end of the reply before it above.
  // When the older page lands, that reply can grow where it is (#708).
  it('holds what starts on the screen, so the growth does not push it down', () => {
    const page = transcript([['before', 241], ['send', 88], ['reply', 600]]);
    page.scrollTo(213);
    page.anchor.capture();

    page.resize(0, 310);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetOf('send')).toBeCloseTo(28);
  });

  it('holds the cut entry when nothing else starts on the screen', () => {
    const page = transcript([['long', 900], ['below', 100]]);
    page.scrollTo(100);
    page.anchor.capture();

    page.insert(0, ['older', 400]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetOf('long')).toBeCloseTo(-100);
  });

  it('does not hold an entry below the screen while one is being read', () => {
    const page = transcript([['long', 900], ['below', 100]]);
    page.scrollTo(100);
    page.anchor.capture();

    // It grows past the bottom of the screen: what is being read has not moved.
    page.resize(0, 1000);
    expect(page.anchor.restore()).toBe(true);

    expect(page.container.scrollTop).toBe(100);
  });
});

describe('useScrollAnchor: an entry drawn in two places', () => {
  // One entry can hold a report of the app's and the user's send, drawn as a line of the reply before and as the
  // bubble. A page then lands in the gap further down. Holding what is past the gap took the reader there (#708).
  it('holds the very element that was on the screen, not one past where the page landed', () => {
    const page = transcript([['send', 38], ['send', 463], ['after-gap', 600]]);
    page.scrollTo(10);
    page.anchor.capture();

    page.insert(2, ['filled', 1052]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetAt(1)).toBeCloseTo(28);
    expect(page.container.scrollTop).toBe(10);
  });
});

describe('useScrollAnchor: the stretch not held is on the screen', () => {
  // What is past the stretch moves when the stretch fills. A reader whose screen begins before it stays put.
  it('holds what is before the stretch, though only what is past it starts on the screen', () => {
    const page = transcript([['cut', 300], [GAP, 0], ['past', 100]]);
    page.scrollTo(100);
    page.anchor.capture();

    page.insert(1, ['filled', 500]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.container.scrollTop).toBe(100);
  });

  it('holds what is past the stretch for a reader whose screen begins there', () => {
    const page = transcript([['older', 100], [GAP, 0], ['read', 600]]);
    page.scrollTo(150);
    page.anchor.capture();

    page.insert(1, ['filled', 500]);
    expect(page.anchor.restore()).toBe(true);

    expect(page.offsetOf('read')).toBeCloseTo(-50);
  });
});
