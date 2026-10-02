import { useCallback, useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import {
  AUTO_SCROLL_BOTTOM_EPS,
  AUTO_SCROLL_THRESHOLD_DEFAULT,
  clampAutoScrollThreshold,
  nextAutoFollow,
  shouldShowScrollToBottom,
} from '@/utils/autoScroll';

/** How long scrolling has to pause before the position is written down. */
const SAVE_DEBOUNCE_MS = 300;

export interface UseAutoScrollOptions {
  /**
   * What is being shown: a session id, an agent id, an output file. A new value
   * starts over: the next content is positioned from scratch and following is
   * switched back on, because the old position belonged to something else.
   */
  resetKey: string | null | undefined;
  /**
   * Where the reading position is remembered, or null to remember nothing.
   *
   * Read once, the first time there is content to position, and removed as it
   * is read; written again 300ms after the user stops scrolling.
   */
  storageKey: string | null;
  /** There is something on screen to position. Nothing is positioned before. */
  hasContent: boolean;
  /**
   * Content is arriving live. Following glides to the new bottom while this
   * holds, and jumps there otherwise.
   */
  isStreaming: boolean;
  /**
   * Changes whenever the user sends something. A new non-null value switches
   * following back on even if the user had scrolled away, so the reply to
   * what they just sent is followed. Null is ignored.
   */
  rearmKey: string | null;
  /**
   * Position a scrolling element that replaced the previous one from scratch,
   * as on first load, instead of reading its fresh `scrollTop` of 0 as the user
   * scrolling to the top. Off unless asked for: the main chat's element never
   * changes, and leaving this off keeps its behaviour exactly as it was.
   */
  repositionOnRemount?: boolean;
}

export interface UseAutoScroll {
  /** Attach to the scrolling element. */
  scrollRef: RefObject<HTMLDivElement>;
  /** Whether the "Scroll to bottom" button should be on screen. */
  showScrollButton: boolean;
  /** Attach to the scrolling element's `onScroll`. Remembers the position. */
  handleScroll: () => void;
  /** Glide to the bottom. What the "Scroll to bottom" button does. */
  scrollToBottom: () => void;
  /**
   * The scroll position and content height as of the last frame.
   *
   * Exposed for a caller that moves the view itself (the main chat, when an
   * older page is put in above what is on screen): it reads where the view was
   * from here and writes the corrected position back, so the next frame does
   * not mistake that correction for the user scrolling.
   */
  prevScrollTopRef: MutableRefObject<number>;
  lastScrollHeightRef: MutableRefObject<number>;
  /** Whether the view is following the bottom right now. */
  autoFollowRef: MutableRefObject<boolean>;
}

/**
 * Keep a scrolling transcript at its newest content, the way the main chat
 * does, for every screen that shows one.
 *
 * Following tracks what the user meant, not where the view happens to be (see
 * `nextAutoFollow`): content growing below the fold does not switch it off,
 * only the user scrolling away past the "Auto-scroll resume distance" setting
 * does, and scrolling back within that distance switches it on again. The
 * check runs every animation frame rather than when data changes, because
 * content keeps growing after the data lands (markdown, code blocks, images
 * laying out), and a check that only ran once would miss all of that.
 *
 * The frame loop, the first positioning, the remembered position and the
 * re-arming are the main chat's own code moved here unchanged; an equivalence
 * test (useAutoScroll.mainEquivalence.test.tsx) holds them to the version the
 * main chat ran before. Anything added for other screens is opt-in.
 */
export function useAutoScroll(options: UseAutoScrollOptions): UseAutoScroll {
  const { resetKey, storageKey, hasContent, isStreaming, rearmKey, repositionOnRemount = false } = options;

  // The same read the main chat has always made: a provider is required, and a
  // missing one throws rather than quietly falling back.
  const { settings } = useSettings();
  const autoScrollThreshold = clampAutoScrollThreshold(
    settings[SettingKey.AUTO_SCROLL_THRESHOLD] ?? AUTO_SCROLL_THRESHOLD_DEFAULT,
  );
  const repositionOnRemountRef = useRef(repositionOnRemount);
  repositionOnRemountRef.current = repositionOnRemount;

  const scrollRef = useRef<HTMLDivElement>(null);
  const isInitialScrollDoneRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The element positioned last, so a replacement can be told apart from it.
  const positionedElRef = useRef<HTMLElement | null>(null);

  // Refs to read fast-changing states inside requestAnimationFrame loop without re-registering it
  const hasContentRef = useRef(hasContent);
  const isStreamingRef = useRef(isStreaming);
  const storageKeyRef = useRef(storageKey);

  useEffect(() => {
    hasContentRef.current = hasContent;
    isStreamingRef.current = isStreaming;
    storageKeyRef.current = storageKey;
  }, [hasContent, isStreaming, storageKey]);

  // Auto-follow tracks user *intent*, not viewport position.
  const autoFollowRef = useRef(true);
  const prevScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // The last rearmKey we re-armed auto-follow for, so a fresh send is detected
  // even after the user scrolled auto-follow off.
  const lastRearmKeyRef = useRef<string | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Track what is being shown
  useEffect(() => {
    isInitialScrollDoneRef.current = false;
    autoFollowRef.current = true;
  }, [resetKey]);

  // Re-arm auto-follow whenever the user sends something, even if they had
  // scrolled up and turned auto-follow off. This effect only writes refs, so it
  // never triggers an extra render.
  useEffect(() => {
    if (rearmKey && rearmKey !== lastRearmKeyRef.current) {
      lastRearmKeyRef.current = rearmKey;
      autoFollowRef.current = true;
    }
  }, [rearmKey]);

  // Drive auto-follow and scroll positioning from requestAnimationFrame
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const el = scrollRef.current;
      if (el) {
        if (repositionOnRemountRef.current && el !== positionedElRef.current) {
          // A new scrolling element starts at the top. Position it the way a
          // first load is positioned rather than reading that as a scroll.
          // The very first element needs nothing here: it is positioned anyway.
          if (positionedElRef.current !== null) isInitialScrollDoneRef.current = false;
          positionedElRef.current = el;
        }

        // 1. Initial scroll positioning (instant)
        if (!isInitialScrollDoneRef.current && hasContentRef.current && el.scrollHeight > 0) {
          const key = storageKeyRef.current;
          const cached = key ? localStorage.getItem(key) : null;
          if (key && cached) {
            const top = Number(cached);
            el.scrollTop = top;
            localStorage.removeItem(key);
            const cachedDist = el.scrollHeight - top - el.clientHeight;
            autoFollowRef.current = cachedDist <= autoScrollThreshold;
          } else {
            // Default: instant scroll to bottom
            el.scrollTop = el.scrollHeight;
            autoFollowRef.current = true;
          }
          isInitialScrollDoneRef.current = true;
          prevScrollTopRef.current = el.scrollTop;
          lastScrollHeightRef.current = el.scrollHeight;
        } else {
          // 2. Normal auto-scroll follow
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          const delta = el.scrollTop - prevScrollTopRef.current;
          const next = nextAutoFollow(autoFollowRef.current, delta, dist, autoScrollThreshold);
          autoFollowRef.current = next;

          const show = shouldShowScrollToBottom(next, hasContentRef.current, dist, autoScrollThreshold);
          setShowScrollButton(prev => (prev === show ? prev : show));

          const grew = el.scrollHeight !== lastScrollHeightRef.current;
          if (next && grew && dist > AUTO_SCROLL_BOTTOM_EPS) {
            // Smooth scroll during streaming, instant otherwise
            el.scrollTo({
              top: el.scrollHeight,
              behavior: isStreamingRef.current ? 'smooth' : 'auto',
            });
          }
          lastScrollHeightRef.current = el.scrollHeight;
          prevScrollTopRef.current = el.scrollTop;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [autoScrollThreshold]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Debounced save scroll position to localStorage
    if (storageKey) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(storageKey, String(el.scrollTop));
      }, SAVE_DEBOUNCE_MS);
    }
  }, [storageKey]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Pressing the button is the user asking to follow the bottom again. Without
    // this, a caller that moves the view by itself while the glide is under way
    // (the log pane putting the reader back after text left from above) writes
    // the scroll position and cancels the glide, and the view stops part-way.
    // Pressing the button is the user asking to follow the bottom again. Without
    // this, a caller that moves the view by itself while the glide is under way
    // (the log pane putting the reader back after text left from above) writes
    // the scroll position and cancels the glide, and the view stops part-way.
    autoFollowRef.current = true;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  return {
    scrollRef,
    showScrollButton,
    handleScroll,
    scrollToBottom,
    prevScrollTopRef,
    lastScrollHeightRef,
    autoFollowRef,
  };
}
