import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { TYPEWRITER_FRESH_MS, TypewriterText, splitLetters } from '../TypewriterText';

/**
 * A title Claude Code has just generated appears letter by letter instead of replacing the old
 * one in a single frame. Only a fresh one: reopening a session or reloading the list shows its
 * title as it is.
 */

/** What is on screen: the letters drawn so far while it plays, the whole text once it is a plain span. */
function shown(container: HTMLElement): string {
  return (container.querySelector('[aria-hidden="true"]') ?? container).textContent ?? '';
}

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  mockReducedMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('splitLetters', () => {
  it('keeps a Hangul syllable, an emoji and an accented letter whole', () => {
    expect(splitLetters('한글👍é')).toEqual(['한', '글', '👍', 'é']);
  });
});

describe('TypewriterText', () => {
  it('shows the text at once when it did not just arrive as a generated title', () => {
    const { container } = render(<TypewriterText text="Fix the login bug" />);

    expect(shown(container)).toBe('Fix the login bug');
  });

  it('shows the text at once when the title arrived long ago', () => {
    const { container } = render(
      <TypewriterText text="Fix the login bug" arrivedAt={Date.now() - TYPEWRITER_FRESH_MS - 1} />,
    );

    expect(shown(container)).toBe('Fix the login bug');
  });

  it('draws a fresh generated title letter by letter, then leaves it whole', () => {
    const { container } = render(<TypewriterText text="로그인 버그" arrivedAt={Date.now()} />);

    // Nothing of it is shown before the first letter, so the old title is never followed by a flash of the new one.
    expect(shown(container)).toBe('');
    const seen: string[] = [];
    for (let i = 0; i < 20; i++) {
      act(() => { vi.advanceTimersByTime(55); });
      seen.push(shown(container));
    }

    // Every state is a prefix of the title, in whole letters, and it grows until it is all there.
    for (const state of seen) expect('로그인 버그'.startsWith(state)).toBe(true);
    expect(new Set(seen).size).toBeGreaterThan(2);
    expect(seen[seen.length - 1]).toBe('로그인 버그');
  });

  it('never takes longer than a second and a half to draw a long title', () => {
    const text = 'a'.repeat(200);
    const { container } = render(<TypewriterText text={text} arrivedAt={Date.now()} />);

    act(() => { vi.advanceTimersByTime(1_700); });

    expect(shown(container)).toBe(text);
  });

  it('plays a text once: drawing it again shows it whole', () => {
    const arrivedAt = Date.now();
    const { container, rerender } = render(<TypewriterText text="Same title" arrivedAt={arrivedAt} />);
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(shown(container)).toBe('Same title');

    rerender(<TypewriterText text="Same title" arrivedAt={arrivedAt} />);
    rerender(<TypewriterText text="Same title" arrivedAt={Date.now()} />);

    expect(shown(container)).toBe('Same title');
  });

  it('draws a new title over an old one that was still being drawn', () => {
    const { container, rerender } = render(<TypewriterText text="First title" arrivedAt={Date.now()} />);
    act(() => { vi.advanceTimersByTime(60); });

    rerender(<TypewriterText text="Second title" arrivedAt={Date.now()} />);

    expect(shown(container)).toBe('');
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(shown(container)).toBe('Second title');
  });

  it('shows the text at once when the user asked for reduced motion', () => {
    mockReducedMotion(true);

    const { container } = render(<TypewriterText text="Fix the login bug" arrivedAt={Date.now()} />);

    expect(shown(container)).toBe('Fix the login bug');
  });

  it('gives a screen reader the finished text from the start', () => {
    const { container } = render(<TypewriterText text="Fix the login bug" arrivedAt={Date.now()} />);

    expect(container.querySelector('[aria-label="Fix the login bug"]')).not.toBeNull();
    expect(shown(container)).toBe('');
  });
});
