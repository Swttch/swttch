/**
 * The main chat's auto-scroll must behave exactly as it did before it moved
 * into useAutoScroll.
 *
 * `useHeadChatAutoScroll` below is the main chat's auto-scroll as it stood in
 * `pages/ChatPage/index.tsx` before the move (git 7fc441d), copied line for
 * line: the settings read, the refs, the session-change reset, the re-arm on a
 * new user message, the requestAnimationFrame loop, and the "remember where I
 * am" half of the scroll handler. Nothing in it may be edited to make a test
 * pass; it is the yardstick.
 *
 * Each scenario is a script of things that happen to a chat: frames passing,
 * content growing, the user scrolling, messages and sessions changing, the
 * setting changing, time passing for the debounced save. The same script is run
 * once against the yardstick and once against `useChatAutoScroll` (the exact
 * wiring the chat page uses today), and after every step both record the
 * scroll position, whether following is on, whether the button is shown, every
 * localStorage read/write/delete, and every `scrollTo` call with its arguments.
 * The two recordings must be identical.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import { installRafQueue, stubScrollBox, type RafQueue, type ScrollBox } from './scrollTestKit';

let settingsState: Record<string, unknown> = {};
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: settingsState }),
}));

import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import {
  clampAutoScrollThreshold,
  nextAutoFollow,
  shouldShowScrollToBottom,
  AUTO_SCROLL_THRESHOLD_DEFAULT,
  AUTO_SCROLL_BOTTOM_EPS,
} from '@/utils/autoScroll';
import { findNewestUserUuid } from '@/pages/ChatPage/paging';
import { useChatAutoScroll } from '@/pages/ChatPage/useChatAutoScroll';
import type { LoadedMessageDto } from '@/types';

// ---------------------------------------------------------------------------
// The yardstick: the main chat's auto-scroll before the move, verbatim.
// ---------------------------------------------------------------------------

interface Probe {
  scrollContainerRef: RefObject<HTMLDivElement>;
  showScrollButton: boolean;
  /** The scroll handler's save half. */
  handleScroll: () => void;
  autoFollowRef: MutableRefObject<boolean>;
  prevScrollTopRef: MutableRefObject<number>;
}

function useHeadChatAutoScroll(currentSessionId: string | null, messages: LoadedMessageDto[], isStreaming: boolean): Probe {
  const { settings } = useSettings();
  const autoScrollThreshold = clampAutoScrollThreshold(
    settings[SettingKey.AUTO_SCROLL_THRESHOLD] ?? AUTO_SCROLL_THRESHOLD_DEFAULT,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll position & page tracking refs
  const isInitialScrollDoneRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs to read fast-changing states inside requestAnimationFrame loop without re-registering it
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(isStreaming);
  const currentSessionIdRef = useRef(currentSessionId);
  const hasMessagesRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    isStreamingRef.current = isStreaming;
    currentSessionIdRef.current = currentSessionId;
    hasMessagesRef.current = messages.length > 0;
  }, [messages, isStreaming, currentSessionId]);

  // Auto-follow tracks user *intent*, not viewport position.
  const autoFollowRef = useRef(true);
  const prevScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // uuid of the newest user message we last re-armed auto-follow for, so a
  // fresh send is detected even after the user scrolled auto-follow off.
  const lastFollowedUserUuidRef = useRef<string | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Track session change
  useEffect(() => {
    isInitialScrollDoneRef.current = false;
    autoFollowRef.current = true;
  }, [currentSessionId]);

  useEffect(() => {
    const uuid = findNewestUserUuid(messages);
    if (uuid && uuid !== lastFollowedUserUuidRef.current) {
      lastFollowedUserUuidRef.current = uuid;
      autoFollowRef.current = true;
    }
  }, [messages]);

  // Drive auto-follow and scroll positioning from requestAnimationFrame
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const el = scrollContainerRef.current;
      if (el) {
        const msgs = messagesRef.current;
        const sid = currentSessionIdRef.current;

        // 1. Initial scroll positioning (instant)
        if (!isInitialScrollDoneRef.current && msgs.length > 0 && el.scrollHeight > 0) {
          const key = `claude-gui:scroll:${sid}`;
          const cached = localStorage.getItem(key);
          if (cached) {
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

          const show = shouldShowScrollToBottom(next, hasMessagesRef.current, dist, autoScrollThreshold);
          setShowScrollButton(prev => (prev === show ? prev : show));

          const grew = el.scrollHeight !== lastScrollHeightRef.current;
          if (next && grew && dist > AUTO_SCROLL_BOTTOM_EPS) {
            // Smooth scroll during streaming, instant otherwise
            el.scrollTo({
              top: el.scrollHeight,
              behavior: isStreamingRef.current ? 'smooth' : 'auto'
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

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // 1. Debounced save scroll position to localStorage
    if (currentSessionId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(`claude-gui:scroll:${currentSessionId}`, String(el.scrollTop));
      }, 300);
    }
  };

  return { scrollContainerRef, showScrollButton, handleScroll, autoFollowRef, prevScrollTopRef };
}

// ---------------------------------------------------------------------------
// The thing under test: the main chat's current wiring.
// ---------------------------------------------------------------------------

function useCurrentChatAutoScroll(currentSessionId: string | null, messages: LoadedMessageDto[], isStreaming: boolean): Probe {
  const a = useChatAutoScroll(currentSessionId, messages, isStreaming);
  return {
    scrollContainerRef: a.scrollRef,
    showScrollButton: a.showScrollButton,
    handleScroll: a.rememberScrollPosition,
    autoFollowRef: a.autoFollowRef,
    prevScrollTopRef: a.prevScrollTopRef,
  };
}

// ---------------------------------------------------------------------------
// Running a script and recording what happened.
// ---------------------------------------------------------------------------

type Impl = typeof useHeadChatAutoScroll;

interface ChatProps {
  sid: string | null;
  messages: LoadedMessageDto[];
  streaming: boolean;
}

let probe: Probe;

function Chat(props: ChatProps & { impl: Impl }) {
  probe = props.impl(props.sid, props.messages, props.streaming);
  return <div ref={probe.scrollContainerRef} onScroll={probe.handleScroll} data-testid="chat-scroll" />;
}

function user(uuid: string): LoadedMessageDto {
  return { type: 'user', uuid, message: { role: 'user', content: `sent ${uuid}` } } as unknown as LoadedMessageDto;
}
function reply(uuid: string): LoadedMessageDto {
  return { type: 'assistant', uuid, message: { role: 'assistant', content: [{ type: 'text', text: uuid }] } } as unknown as LoadedMessageDto;
}
function toolResult(uuid: string): LoadedMessageDto {
  return {
    type: 'user',
    uuid,
    toolUseResult: {},
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] },
  } as unknown as LoadedMessageDto;
}

interface Ctx {
  box: ScrollBox;
  raf: RafQueue;
  props: ChatProps;
  set(next: Partial<ChatProps>): void;
  unmount(): void;
}

interface Step {
  name: string;
  run(ctx: Ctx): void;
}

interface Snapshot {
  step: string;
  scrollTop: number;
  autoFollow: boolean;
  button: boolean;
  storage: string[];
  scrollTo: ScrollToOptions[];
}

interface Scenario {
  seed?: { [key: string]: string };
  settings?: Record<string, unknown>;
  initial: ChatProps;
  metrics: { scrollHeight: number; clientHeight: number };
  steps: Step[];
}

/** A localStorage that writes down every call made to it. */
function installLoggingStorage(seed: { [key: string]: string }, log: string[]) {
  const store = new Map(Object.entries(seed));
  const storage = {
    get length() { return store.size; },
    clear() { log.push('clear'); store.clear(); },
    key(i: number) { return Array.from(store.keys())[i] ?? null; },
    getItem(k: string) { log.push(`get ${k}`); return store.has(k) ? store.get(k)! : null; },
    setItem(k: string, v: string) { log.push(`set ${k}=${v}`); store.set(k, String(v)); },
    removeItem(k: string) { log.push(`remove ${k}`); store.delete(k); },
  } as Storage;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage });
  Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: storage });
}

function runScenario(impl: Impl, scenario: Scenario): Snapshot[] {
  const storageLog: string[] = [];
  installLoggingStorage(scenario.seed ?? {}, storageLog);
  settingsState = { ...(scenario.settings ?? {}) };
  const raf = installRafQueue();

  let props = scenario.initial;
  let mounted = true;
  const view = render(<Chat impl={impl} {...props} />);
  const box = stubScrollBox(view.getByTestId('chat-scroll'), scenario.metrics);
  const ctx: Ctx = {
    box,
    raf,
    get props() { return props; },
    set(next) {
      props = { ...props, ...next };
      view.rerender(<Chat impl={impl} {...props} />);
    },
    unmount: () => {
      mounted = false;
      view.unmount();
    },
  };

  const records: Snapshot[] = [];
  let seenScrollTo = 0;
  for (const step of scenario.steps) {
    storageLog.length = 0;
    step.run(ctx);
    records.push({
      step: step.name,
      scrollTop: box.el.scrollTop,
      autoFollow: probe.autoFollowRef.current,
      button: probe.showScrollButton,
      storage: [...storageLog],
      scrollTo: box.scrollToCalls.slice(seenScrollTo),
    });
    seenScrollTo = box.scrollToCalls.length;
  }
  if (mounted) view.unmount();
  vi.unstubAllGlobals();
  return records;
}

function compare(scenario: Scenario) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const before = runScenario(useHeadChatAutoScroll, scenario);
  vi.clearAllTimers();
  const now = runScenario(useCurrentChatAutoScroll, scenario);
  vi.useRealTimers();
  return { before, now };
}

const frames = (n = 1): Step => ({ name: `${n} frame(s)`, run: (c) => c.raf.flushFrames(n) });
const grow = (h: number): Step => ({ name: `content grows to ${h}`, run: (c) => { c.box.setScrollHeight(h); c.raf.flushFrames(); } });
const scrollTo = (top: number): Step => ({ name: `user scrolls to ${top}`, run: (c) => { c.box.userScrollTo(top); c.raf.flushFrames(); } });
const wait = (ms: number): Step => ({ name: `wait ${ms}ms`, run: () => { vi.advanceTimersByTime(ms); } });
const props = (name: string, next: Partial<ChatProps>): Step => ({ name, run: (c) => { c.set(next); c.raf.flushFrames(); } });

// ---------------------------------------------------------------------------

describe('main chat auto-scroll, before and after moving into useAutoScroll', () => {
  beforeEach(() => {
    settingsState = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('a whole session: opening, following, leaving, coming back, sends, streaming on and off', () => {
    const scenario: Scenario = {
      initial: { sid: 's1', messages: [], streaming: false },
      metrics: { scrollHeight: 400, clientHeight: 400 },
      steps: [
        frames(2),
        { name: 'first messages land', run: (c) => { c.set({ messages: [user('u1'), reply('m1')] }); c.box.setScrollHeight(2000); c.raf.flushFrames(2); } },
        props('streaming starts', { streaming: true }),
        grow(2300),
        grow(2600),
        scrollTo(2120), // exactly the 80px resume distance from the bottom
        grow(2700),
        scrollTo(2219), // 81px: one past the distance
        grow(3000),
        wait(299),
        wait(1),
        scrollTo(1000),
        grow(3300),
        props('a reply lands (no send)', { messages: [user('u1'), reply('m1'), reply('m2')] }),
        grow(3500),
        props('a tool result lands (not a send)', { messages: [user('u1'), reply('m1'), reply('m2'), toolResult('t1')] }),
        grow(3600),
        props('the user sends', { messages: [user('u1'), reply('m1'), reply('m2'), toolResult('t1'), user('u2')] }),
        grow(3900),
        grow(9000), // one large block at once (issue #100)
        props('streaming ends', { streaming: false }),
        grow(9400),
        scrollTo(8920), // inside the distance: following resumes
        grow(9600),
        scrollTo(100),
        wait(300),
        frames(3),
      ],
    };
    const { before, now } = compare(scenario);
    expect(now).toEqual(before);
    // Not vacuous: the script really did read, write, glide and jump.
    const flat = JSON.stringify(before);
    expect(flat).toContain('get claude-gui:scroll:s1');
    expect(flat).toContain('set claude-gui:scroll:s1=');
    expect(flat).toContain('"behavior":"smooth"');
    expect(flat).toContain('"behavior":"auto"');
    expect(before.some((r) => r.button)).toBe(true);
    expect(before.some((r) => !r.autoFollow)).toBe(true);
  });

  it('switching sessions, with and without a remembered position, and with no session id', () => {
    const scenario: Scenario = {
      seed: {
        'claude-gui:scroll:s2': '500',
        'claude-gui:scroll:s3': '1090',
        // Never written by the chat, but read all the same while there is no id.
        'claude-gui:scroll:null': '120',
      },
      initial: { sid: 's1', messages: [user('a1')], streaming: false },
      metrics: { scrollHeight: 1500, clientHeight: 400 },
      steps: [
        frames(2),
        scrollTo(300),
        props('switch to s2 (remembered far up)', { sid: 's2', messages: [user('b1'), reply('b2')] }),
        frames(2),
        grow(1700),
        scrollTo(200),
        wait(300),
        props('switch to s3 (remembered within the distance)', { sid: 's3', messages: [user('c1')] }),
        frames(2),
        grow(1800),
        props('no session id yet', { sid: null, messages: [user('d1')] }),
        frames(2),
        scrollTo(50),
        wait(300),
        props('back to s1', { sid: 's1', messages: [user('a1')] }),
        frames(2),
        { name: 'scroll, then leave before the save', run: (c) => { c.box.userScrollTo(10); c.unmount(); } },
        wait(500),
      ],
    };
    const { before, now } = compare(scenario);
    expect(now).toEqual(before);
    const flat = JSON.stringify(before);
    expect(flat).toContain('remove claude-gui:scroll:s2');
    expect(flat).toContain('get claude-gui:scroll:null');
  });

  it('the resume distance setting, including a change while open', () => {
    const scenario: Scenario = {
      settings: { [SettingKey.AUTO_SCROLL_THRESHOLD]: 300 },
      initial: { sid: 's1', messages: [user('u1')], streaming: true },
      metrics: { scrollHeight: 2000, clientHeight: 400 },
      steps: [
        frames(2),
        scrollTo(1300), // 300px up: still following under 300
        grow(2200),
        scrollTo(1499), // 301px up
        grow(2300),
        { name: 'setting changes to 20000 (clamped to 1000)', run: (c) => { settingsState = { [SettingKey.AUTO_SCROLL_THRESHOLD]: 20000 }; c.set({}); c.raf.flushFrames(); } },
        grow(2400),
        { name: 'setting changes to 0 (clamped to 1)', run: (c) => { settingsState = { [SettingKey.AUTO_SCROLL_THRESHOLD]: 0 }; c.set({}); c.raf.flushFrames(); } },
        scrollTo(1990),
        grow(2600),
        scrollTo(2199),
        grow(2800),
      ],
    };
    const { before, now } = compare(scenario);
    expect(now).toEqual(before);
  });

  // The chat's paging writes the hook's baseline itself (loadMore records the
  // position, the prepend correction moves the view). Both must react to that
  // write the same way.
  it('a caller writing the scroll baseline, as paging does', () => {
    const scenario: Scenario = {
      initial: { sid: 's1', messages: [user('u1')], streaming: false },
      metrics: { scrollHeight: 3000, clientHeight: 400 },
      steps: [
        frames(2),
        {
          name: 'jump to the top and record it as paging does',
          run: (c) => {
            c.box.userScrollTo(0);
            probe.prevScrollTopRef.current = c.box.el.scrollTop;
            c.raf.flushFrames();
          },
        },
        {
          name: 'older page put in above, view corrected by the caller',
          run: (c) => {
            c.box.setScrollHeight(3600);
            c.box.el.scrollTop = probe.prevScrollTopRef.current + 600;
            probe.prevScrollTopRef.current = c.box.el.scrollTop;
            c.raf.flushFrames();
          },
        },
        grow(3800),
        frames(2),
      ],
    };
    const { before, now } = compare(scenario);
    expect(now).toEqual(before);
  });
});
