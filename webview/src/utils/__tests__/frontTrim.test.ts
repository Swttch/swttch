import { describe, it, expect, afterEach } from 'vitest';
import { frontTrimKeptLength, frontTrimScrollTop, heightAfter } from '../frontTrim';

const lines = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => `count: ${from + i}\n`).join('');

describe('frontTrimKeptLength', () => {
  it('is null when the text only grew', () => {
    expect(frontTrimKeptLength('a\nb\n', 'a\nb\nc\n')).toBeNull();
  });

  it('is null when nothing changed', () => {
    expect(frontTrimKeptLength('a\nb\n', 'a\nb\n')).toBeNull();
  });

  it('is null for an empty side', () => {
    expect(frontTrimKeptLength('', 'a\n')).toBeNull();
    expect(frontTrimKeptLength('a\n', '')).toBeNull();
  });

  it('is null for unrelated text', () => {
    expect(frontTrimKeptLength(lines(0, 10), 'something else entirely\n')).toBeNull();
  });

  it('measures what survived a cut at the front with more added at the end', () => {
    const prev = lines(0, 100);
    const next = lines(10, 110);
    expect(frontTrimKeptLength(prev, next)).toBe(lines(10, 100).length);
  });

  // The backend cuts by character count, so the cut lands mid-line.
  it('handles a cut in the middle of a line', () => {
    const full = lines(0, 120);
    const prev = full.slice(0, 1000).slice(-800);
    const next = full.slice(0, 1100).slice(-800);
    const kept = frontTrimKeptLength(prev, next);
    expect(kept).toBe(700);
    expect(next.slice(0, kept!)).toBe(prev.slice(-kept!));
  });

  it('handles a cut with nothing added', () => {
    const prev = lines(0, 20);
    const next = lines(5, 20);
    expect(frontTrimKeptLength(prev, next)).toBe(next.length);
  });

  // With lines repeating, the text being searched for turns up in several
  // places; only the one where everything after it matches is the cut.
  it('finds the cut among repeated lines', () => {
    const prev = 'tick\n'.repeat(20);
    const next = `${'tick\n'.repeat(17)}${'tock\n'.repeat(3)}`;
    expect(frontTrimKeptLength(prev, next)).toBe(85);
  });

  // A log of one line over and over reads the same at any cut, so which one
  // is taken cannot be seen. It is reported as no cut at all.
  it('reports no cut when every cut would show the same text', () => {
    const prev = 'tick\n'.repeat(20);
    expect(frontTrimKeptLength(prev, 'tick\n'.repeat(20))).toBeNull();
  });
});

/**
 * What the reader sees, on full-size repetitive logs.
 *
 * The backend keeps the last 200,000 characters. A reader has the line at
 * `frac` of the old text at the top of the view; `add` characters arrive. With
 * every '\n'-separated line 20px tall (the same made-up layout the component
 * test uses), the correction BackgroundTaskOutputBody applies is worked out and
 * the text of the line now at the top is compared with the one before. A line
 * that was itself cut away, the partial first line, and the growing last line
 * cannot stay whole on screen, so they are not scored.
 */
describe('frontTrimKeptLength on repetitive logs, as the reader sees it', () => {
  const MAX = 200_000;
  const LINE_PX = 20;

  function lineStarts(text: string): number[] {
    const starts = [0];
    for (let i = 0; i < text.length - 1; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
    return starts;
  }
  function lineOf(starts: number[], offset: number): number {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  const lineText = (text: string, starts: number[], i: number) => text.slice(starts[i], starts[i + 1] ?? text.length);

  function read(full: string, add: number, frac: number) {
    const prevFull = full.slice(0, full.length - add);
    const prev = prevFull.slice(-MAX);
    const next = full.slice(-MAX);
    const ps = lineStarts(prev);
    const ns = lineStarts(next);
    const readLine = Math.floor(ps.length * frac);
    const readOffset = prevFull.length - prev.length + ps[readLine];
    const scored = readOffset >= full.length - next.length && readLine > 0 && readLine < ps.length - 1;

    const kept = frontTrimKeptLength(prev, next);
    let top = readLine * LINE_PX;
    if (kept !== null) {
      const appended = ns.length * LINE_PX - (lineOf(ns, kept - 1) + 1) * LINE_PX;
      const corrected = frontTrimScrollTop({
        prevScrollTop: top,
        prevScrollHeight: ps.length * LINE_PX,
        scrollHeight: ns.length * LINE_PX,
        // One line tall, so the clamp to the scrollable range never decides the
        // outcome here (the carriage-return log has only a few dozen lines).
        clientHeight: LINE_PX,
        appendedHeight: appended,
      });
      if (corrected !== null) top = corrected;
    }
    const topLine = Math.round(top / LINE_PX);
    return { scored, kept, sameText: lineText(next, ns, topLine) === lineText(prev, ps, readLine) };
  }

  const logs: { [name: string]: () => string } = {
    'the same line, 240,000+ characters of it': () => 'tick\n'.repeat(52_000),
    'two lines taking turns': () => 'step A running\nstep B running\n'.repeat(12_000),
    'a progress bar per line, the last one moving': () =>
      Array.from({ length: 9000 }, (_, i) => `[${'#'.repeat(i % 30).padEnd(30)}] ${String(i % 100).padStart(3)}%\n`).join(''),
    'a progress bar redrawn with carriage returns': () =>
      Array.from({ length: 30_000 }, (_, i) => `\r[${'#'.repeat(i % 20).padEnd(20)}] ${i % 100}%${i % 500 === 499 ? '\n' : ''}`).join(''),
    'the same line, then something new': () => 'tick\n'.repeat(48_000) + 'tock\n'.repeat(4000),
    'unique lines, then the same line': () =>
      Array.from({ length: 7000 }, (_, i) => `header line ${i}\n`).join('') + 'tick\n'.repeat(24_000),
    'the same line, unique lines, the same line': () =>
      'tick\n'.repeat(20_000) + Array.from({ length: 2000 }, (_, i) => `middle ${i}\n`).join('') + 'tick\n'.repeat(20_000),
  };

  for (const [name, make] of Object.entries(logs)) {
    it(`never moves the text being read: ${name}`, () => {
      const full = make();
      expect(full.length).toBeGreaterThan(MAX);
      for (const add of [40, 1000, 5000, 20_000]) {
        for (const frac of [0.05, 0.5, 0.95]) {
          const r = read(full, add, frac);
          if (r.scored) expect({ add, frac, sameText: r.sameText }).toEqual({ add, frac, sameText: true });
        }
      }
    });
  }
});

describe('frontTrimScrollTop', () => {
  const base = { prevScrollTop: 400, prevScrollHeight: 1000, scrollHeight: 1000, clientHeight: 300, appendedHeight: 200 };

  it('moves the view up by the height that left from the top', () => {
    expect(frontTrimScrollTop(base)).toBe(200);
  });

  it('refuses anything that is not a finite number', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      for (const key of Object.keys(base) as (keyof typeof base)[]) {
        expect(frontTrimScrollTop({ ...base, [key]: bad })).toBeNull();
      }
    }
  });

  it('refuses an added part with a negative height, or taller than the whole', () => {
    expect(frontTrimScrollTop({ ...base, appendedHeight: -1 })).toBeNull();
    expect(frontTrimScrollTop({ ...base, appendedHeight: 1001 })).toBeNull();
  });

  it('refuses a change larger than the old content', () => {
    expect(frontTrimScrollTop({ ...base, scrollHeight: 5000, appendedHeight: 100 })).toBeNull();
  });

  it('never goes above the top or past the bottom', () => {
    expect(frontTrimScrollTop({ ...base, prevScrollTop: 50 })).toBe(0);
    expect(frontTrimScrollTop({ ...base, prevScrollTop: 1000, appendedHeight: 0 })).toBe(700);
  });
});

describe('heightAfter', () => {
  const LINE_PX = 20;

  afterEach(() => {
    delete (Range.prototype as Partial<Range>).getBoundingClientRect;
  });

  function withFakeLayout() {
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value(this: Range) {
        // Count the lines before this character across every text node in order.
        const root = (this.startContainer.parentNode as Element).closest('pre')!;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let before = '';
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (n === this.startContainer) {
            before += (n.textContent ?? '').slice(0, this.startOffset);
            break;
          }
          before += n.textContent ?? '';
        }
        const line = before.split('\n').length - 1;
        return { top: line * LINE_PX, bottom: (line + 1) * LINE_PX } as DOMRect;
      },
    });
  }

  it('is the height of the lines after the kept text, across coloured spans', () => {
    withFakeLayout();
    const pre = document.createElement('pre');
    pre.append('one\ntwo\n');
    const span = document.createElement('span');
    span.textContent = 'three\nfour\n';
    pre.append(span, 'five\n');
    document.body.append(pre);

    const text = pre.textContent!;
    // Kept "one\ntwo\nthree\n", added "four\nfive\n": two lines.
    expect(heightAfter(pre, 'one\ntwo\nthree\n'.length, text.length)).toBe(2 * LINE_PX);
    pre.remove();
  });

  it('is null without layout', () => {
    const pre = document.createElement('pre');
    pre.textContent = 'one\ntwo\n';
    expect(heightAfter(pre, 4, 8)).toBeNull();
  });

  // What an engine that measured nothing hands back: every box empty, or
  // numbers that are not numbers. Neither may turn into a scroll position.
  it('is null when the engine returns empty or broken boxes', () => {
    const pre = document.createElement('pre');
    pre.textContent = 'one\ntwo\nthree\n';
    document.body.append(pre);
    for (const rect of [
      { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 },
      { top: NaN, bottom: NaN, width: 0, height: 0 },
      { top: 0, bottom: Infinity, width: 1, height: Infinity },
    ]) {
      Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => rect });
      expect(heightAfter(pre, 4, pre.textContent.length)).toBeNull();
    }
    pre.remove();
  });

  it('is null when the added part would measure negative', () => {
    const pre = document.createElement('pre');
    pre.textContent = 'one\ntwo\n';
    document.body.append(pre);
    let call = 0;
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      // The kept end measured below the last character: impossible in a real layout.
      value: () => (call++ === 0 ? { top: 80, bottom: 100, width: 5, height: 20 } : { top: 0, bottom: 20, width: 5, height: 20 }),
    });
    expect(heightAfter(pre, 4, 8)).toBeNull();
    pre.remove();
  });

  it('is null for a kept length out of range', () => {
    const pre = document.createElement('pre');
    pre.textContent = 'one\n';
    expect(heightAfter(pre, 0, 4)).toBeNull();
    expect(heightAfter(pre, 5, 4)).toBeNull();
  });
});
