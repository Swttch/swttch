import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { installRafQueue, stubScrollBox, type RafQueue, type ScrollBox } from './scrollTestKit';

// The resume distance comes from the "Auto-scroll resume distance" setting.
// Null (no provider) means the default, 80px.
let settingsValue: { settings: Record<string, unknown> } | null = null;
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => settingsValue ?? { settings: {} },
}));

import { useAutoScroll, type UseAutoScroll, type UseAutoScrollOptions } from '../useAutoScroll';

interface HarnessProps extends UseAutoScrollOptions {
  /** Changing this mounts a new scrolling element in place of the old one. */
  boxKey?: string;
  /** False unmounts the scrolling element, as a placeholder taking its place would. */
  showBox?: boolean;
}

let api: UseAutoScroll;

function Harness(props: HarnessProps) {
  const { boxKey = 'box', showBox = true, ...options } = props;
  api = useAutoScroll(options);
  return (
    <>
      {showBox && <div key={boxKey} ref={api.scrollRef} onScroll={api.handleScroll} data-testid="box" />}
      {api.showScrollButton && <span>Scroll to bottom</span>}
    </>
  );
}

const BASE: HarnessProps = {
  resetKey: 's1',
  storageKey: 'claude-gui:scroll:s1',
  hasContent: true,
  isStreaming: false,
  rearmKey: null,
};

function mountWithBox(props: Partial<HarnessProps> = {}, metrics = { scrollHeight: 2000, clientHeight: 400 }) {
  const utils = render(<Harness {...BASE} {...props} />);
  const box = stubScrollBox(screen.getByTestId('box'), metrics);
  const rerender = (next: Partial<HarnessProps>) => utils.rerender(<Harness {...BASE} {...props} {...next} />);
  return { ...utils, box, rerender };
}

function buttonShown() {
  return screen.queryByText('Scroll to bottom') !== null;
}

describe('useAutoScroll', () => {
  let raf: RafQueue;

  beforeEach(() => {
    localStorage.clear();
    settingsValue = null;
    raf = installRafQueue();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe('first positioning', () => {
    it('opens at the bottom when no position was remembered', () => {
      const { box } = mountWithBox();
      raf.flushFrames();
      expect(box.el.scrollTop).toBe(1600);
      expect(api.autoFollowRef.current).toBe(true);
    });

    it('waits for content before using the remembered position', () => {
      localStorage.setItem('claude-gui:scroll:s1', '300');
      const { box, rerender } = mountWithBox({ hasContent: false });
      raf.flushFrames(3);
      expect(localStorage.getItem('claude-gui:scroll:s1')).toBe('300');

      rerender({ hasContent: true });
      raf.flushFrames();
      expect(box.el.scrollTop).toBe(300);
    });

    it('reopens where the user left off, and forgets the position once used', () => {
      localStorage.setItem('claude-gui:scroll:s1', '300');
      const { box } = mountWithBox();
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(300);
      expect(api.autoFollowRef.current).toBe(false);
      expect(localStorage.getItem('claude-gui:scroll:s1')).toBeNull();
    });

    it('reopens following when the remembered position was within the resume distance', () => {
      localStorage.setItem('claude-gui:scroll:s1', '1550');
      mountWithBox();
      raf.flushFrames();
      expect(api.autoFollowRef.current).toBe(true);
    });

    it('remembers nothing without a storage key', () => {
      localStorage.setItem('claude-gui:scroll:null', '300');
      const { box } = mountWithBox({ storageKey: null });
      raf.flushFrames();
      expect(box.el.scrollTop).toBe(1600);
    });
  });

  describe('following', () => {
    it('follows new content to the bottom, instantly when nothing is streaming', () => {
      const { box } = mountWithBox();
      raf.flushFrames();

      box.setScrollHeight(2300);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(1900);
      expect(box.lastScrollTo()).toEqual({ top: 2300, behavior: 'auto' });
    });

    it('glides to the new bottom while streaming', () => {
      const { box } = mountWithBox({ isStreaming: true });
      raf.flushFrames();

      box.setScrollHeight(2300);
      raf.flushFrames();

      expect(box.lastScrollTo()).toEqual({ top: 2300, behavior: 'smooth' });
    });

    // Issue #100: a big block landing at once pushes the bottom out past the
    // resume distance without the user doing anything. That must not read as
    // the user leaving.
    it('keeps following when one large block pushes the bottom far away', () => {
      const { box } = mountWithBox();
      raf.flushFrames();

      box.setScrollHeight(5000);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(4600);
      expect(buttonShown()).toBe(false);
    });

    it('stays where the user scrolled to while content keeps arriving', () => {
      const { box } = mountWithBox();
      raf.flushFrames();

      box.userScrollTo(500);
      raf.flushFrames();
      box.setScrollHeight(2600);
      raf.flushFrames(3);

      expect(box.el.scrollTop).toBe(500);
      expect(box.scrollToCalls).toEqual([]);
    });

    it('starts following again once the user scrolls back within the resume distance', () => {
      const { box } = mountWithBox();
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();

      box.userScrollTo(1540); // 60px from the bottom, inside the default 80
      raf.flushFrames();
      box.setScrollHeight(2400);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(2000);
    });

    it('reads the resume distance from the setting', () => {
      settingsValue = { settings: { autoScrollThreshold: 300 } };
      const { box } = mountWithBox();
      raf.flushFrames();

      box.userScrollTo(1400); // 200px up: past the default 80, inside 300
      raf.flushFrames();
      box.setScrollHeight(2200);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(1800);
      expect(buttonShown()).toBe(false);
    });
  });

  describe('"Scroll to bottom" button', () => {
    it('appears as soon as the user scrolls away, before anything new arrives', () => {
      const { box } = mountWithBox();
      raf.flushFrames();
      expect(buttonShown()).toBe(false);

      box.userScrollTo(500);
      raf.flushFrames();

      expect(buttonShown()).toBe(true);
    });

    it('hides again once the view is back within the resume distance', () => {
      const { box } = mountWithBox();
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();

      box.userScrollTo(1590);
      raf.flushFrames();

      expect(buttonShown()).toBe(false);
    });

    it('glides to the bottom when pressed', () => {
      const { box } = mountWithBox();
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();

      act(() => api.scrollToBottom());

      expect(box.lastScrollTo()).toEqual({ top: 2000, behavior: 'smooth' });
      raf.flushFrames();
      expect(buttonShown()).toBe(false);
    });

    it('switches following back on when pressed, so nothing else repositions the view during the glide', () => {
      const { box } = mountWithBox();
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();
      expect(api.autoFollowRef.current).toBe(false);

      act(() => api.scrollToBottom());

      expect(api.autoFollowRef.current).toBe(true);
    });

    it('never shows with nothing on screen', () => {
      const { box, rerender } = mountWithBox();
      raf.flushFrames();
      box.userScrollTo(500);
      rerender({ hasContent: false });
      raf.flushFrames();

      expect(buttonShown()).toBe(false);
    });
  });

  describe('sending', () => {
    it('follows again when the user sends something, even scrolled away', () => {
      const { box, rerender } = mountWithBox({ rearmKey: 'u1' });
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();

      rerender({ rearmKey: 'u2' });
      raf.flushFrames();
      expect(buttonShown()).toBe(false);
      box.setScrollHeight(2500);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(2100);
    });

    it('does not re-arm for a key it has already seen', () => {
      const { box, rerender } = mountWithBox({ rearmKey: 'u1' });
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();

      rerender({ rearmKey: null });
      rerender({ rearmKey: 'u1' });
      box.setScrollHeight(2500);
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(500);
    });
  });

  describe('what is being shown changes', () => {
    it('positions the next thing from scratch', () => {
      localStorage.setItem('claude-gui:scroll:s2', '700');
      const { box, rerender } = mountWithBox();
      raf.flushFrames();
      box.userScrollTo(500);
      raf.flushFrames();

      rerender({ resetKey: 's2', storageKey: 'claude-gui:scroll:s2' });
      raf.flushFrames();

      expect(box.el.scrollTop).toBe(700);
    });

    // A screen that swaps its scrolling area for a placeholder and back gets a
    // new element at scrollTop 0. Read as a scroll, that is the user jumping
    // to the top, which switched following off and left them there (#511).
    it('positions a replaced scrolling element instead of reading its fresh top as a scroll, when asked to', () => {
      const { box, rerender } = mountWithBox({ repositionOnRemount: true });
      raf.flushFrames();
      expect(box.el.scrollTop).toBe(1600);

      rerender({ boxKey: 'second' });
      const replaced: ScrollBox = stubScrollBox(screen.getByTestId('box'), { scrollHeight: 2400, clientHeight: 400 });
      expect(replaced.el).not.toBe(box.el);
      raf.flushFrames();

      expect(replaced.el.scrollTop).toBe(2000);
      expect(api.autoFollowRef.current).toBe(true);
      expect(buttonShown()).toBe(false);
    });

    // Off unless asked for, which is how the main chat uses it: what it did
    // before (read the fresh top as the user scrolling up) is left as it was.
    it('reads a replaced element as before when not asked to', () => {
      const { box, rerender } = mountWithBox();
      raf.flushFrames();

      rerender({ boxKey: 'second' });
      const replaced: ScrollBox = stubScrollBox(screen.getByTestId('box'), { scrollHeight: 2400, clientHeight: 400 });
      raf.flushFrames();

      expect(replaced.el).not.toBe(box.el);
      expect(replaced.el.scrollTop).toBe(0);
      expect(api.autoFollowRef.current).toBe(false);
    });
  });

  describe('remembering the position', () => {
    it('writes the position 300ms after scrolling stops', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { box } = mountWithBox();
      raf.flushFrames();

      box.userScrollTo(500);
      vi.advanceTimersByTime(299);
      expect(localStorage.getItem('claude-gui:scroll:s1')).toBeNull();
      box.userScrollTo(450);
      vi.advanceTimersByTime(299);
      expect(localStorage.getItem('claude-gui:scroll:s1')).toBeNull();
      vi.advanceTimersByTime(1);

      expect(localStorage.getItem('claude-gui:scroll:s1')).toBe('450');
    });

    it('writes nothing without a storage key', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const { box } = mountWithBox({ storageKey: null });
      raf.flushFrames();

      box.userScrollTo(500);
      vi.advanceTimersByTime(1000);

      expect(localStorage.length).toBe(0);
    });
  });
});
