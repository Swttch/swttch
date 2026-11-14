import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { SelectionReplyLayer } from '../SelectionReply/SelectionReplyLayer';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/contexts/SideQuestionContext', () => ({
  useOptionalSideQuestions: () => null,
}));

vi.mock('@/utils/composerReplies', () => ({
  addReplyToComposer: vi.fn(),
}));

/** Selects the text of the transcript and lets the layer pick it up, as a finished drag does. */
function selectTranscriptText(textNode: Text) {
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  act(() => {
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(1);
  });
}

describe('SelectionReplyLayer follows the text while the chat scrolls (#645)', () => {
  let measured: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    measured = vi.fn(() => ({ top: 100, bottom: 120, left: 10, right: 110, width: 100, height: 20, x: 10, y: 100 }));
    Range.prototype.getBoundingClientRect = measured as unknown as () => DOMRect;
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  function mount() {
    const containerRef = createRef<HTMLDivElement>();
    const view = render(
      <div ref={containerRef}>
        <p>hello selected world</p>
        <SelectionReplyLayer containerRef={containerRef} />
      </div>,
    );
    const textNode = view.container.querySelector('p')!.firstChild as Text;
    return { view, textNode };
  }

  it('measures the selection once for a burst of scroll events in one frame', () => {
    const { view, textNode } = mount();
    selectTranscriptText(textNode);
    expect(view.container.querySelector('[role="toolbar"]')).not.toBeNull();
    measured.mockClear();

    act(() => {
      for (let i = 0; i < 50; i++) window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect(measured).toHaveBeenCalledTimes(1);
  });

  it('keeps the bar in place and does not render again when the text has not moved', () => {
    const { view, textNode } = mount();
    selectTranscriptText(textNode);
    const bar = view.container.querySelector('[role="toolbar"]')!;

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect(view.container.querySelector('[role="toolbar"]')).toBe(bar);
  });

  it('moves the bar when the text moved', () => {
    const { view, textNode } = mount();
    selectTranscriptText(textNode);
    const before = (view.container.querySelector('[role="toolbar"]') as HTMLElement).style.top;

    measured.mockImplementation(() => ({ top: 300, bottom: 320, left: 10, right: 110, width: 100, height: 20, x: 10, y: 300 }));
    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect((view.container.querySelector('[role="toolbar"]') as HTMLElement).style.top).not.toBe(before);
  });

  it('ignores the scroll of something that does not hold the selected text', () => {
    const { view, textNode } = mount();
    selectTranscriptText(textNode);
    const elsewhere = document.createElement('div');
    document.body.appendChild(elsewhere);
    measured.mockClear();

    act(() => {
      // Scroll does not bubble, but a capture listener on the window still sees it.
      elsewhere.dispatchEvent(new Event('scroll'));
      view.container.querySelector('[role="toolbar"]')!.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });
    elsewhere.remove();

    expect(measured).not.toHaveBeenCalled();
  });

  it('follows the scroll of an element that holds the selected text', () => {
    const { view, textNode } = mount();
    selectTranscriptText(textNode);
    measured.mockClear();

    act(() => {
      view.container.firstElementChild!.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect(measured).toHaveBeenCalledTimes(1);
  });

  it('reads the page zoom off the root style and never asks for the computed style (#645)', () => {
    document.documentElement.style.zoom = '1.25';
    const computed = vi.spyOn(window, 'getComputedStyle');
    try {
      const { view, textNode } = mount();
      selectTranscriptText(textNode);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(20);
      });
      const bar = view.container.querySelector('[role="toolbar"]') as HTMLElement;
      // top 100 / 1.25, minus the bar's height and gap: the placement is divided by the zoom
      expect(bar.style.top).toBe(`${100 / 1.25 - 36 - 8}px`);
      expect(computed).not.toHaveBeenCalled();
    } finally {
      computed.mockRestore();
      document.documentElement.style.zoom = '';
    }
  });

  it('stops following once the layer is gone', () => {
    const { view, textNode } = mount();
    selectTranscriptText(textNode);
    view.unmount();
    measured.mockClear();

    act(() => {
      window.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(20);
    });

    expect(measured).not.toHaveBeenCalled();
  });
});
