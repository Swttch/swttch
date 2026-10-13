import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const runControlRequestCommand = vi.fn();
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ runControlRequestCommand }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ inputMode: 'ask_before_edit' }),
}));
// The composer reads one app setting (Enter vs Ctrl+Enter to send).
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { useCtrlEnterToSend: false } }),
}));

import { SideQuestionWindow } from '../SideQuestionWindow';
import { defaultRect, maximizedRect } from '../windowGeometry';
import { SideQuestionStatus, type SideQuestionExchange } from '@/contexts/SideQuestionContext';
import { CHAT_FOOTER_ID } from '@/pages/ChatPage/chatFooter';

// jsdom's window is 1024 x 768 and has no root font size, so 1rem falls back to 16px.
const viewport = { width: window.innerWidth, height: window.innerHeight };

function exchange(overrides: Partial<SideQuestionExchange> = {}): SideQuestionExchange {
  return {
    requestId: 'r1',
    sessionId: 's1',
    question: 'why?',
    answer: null,
    status: SideQuestionStatus.Pending,
    delivered: false,
    askedAt: 0,
    settledAt: null,
    ...overrides,
  };
}

interface SetupOptions {
  exchanges?: SideQuestionExchange[];
  isMinimized?: boolean;
  hasUnseen?: boolean;
}

function setup(options: SetupOptions = {}) {
  const handlers = {
    onClose: vi.fn(),
    onClear: vi.fn(),
    onMinimize: vi.fn(),
    onRestore: vi.fn(),
  };
  const utils = render(
    <SideQuestionWindow
      exchanges={options.exchanges ?? []}
      isMinimized={options.isMinimized ?? false}
      hasUnseen={options.hasUnseen ?? false}
      {...handlers}
    />,
  );
  return { ...handlers, ...utils };
}

/** Type into the contenteditable the way the editor's own input path sees it. */
function type(box: HTMLElement, text: string) {
  box.textContent = text;
  fireEvent.input(box);
}

/** jsdom's PointerEvent lacks coordinates; a MouseEvent of the same name carries them to React and to window. */
function pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', target: Element | Window, x: number, y: number) {
  fireEvent(target, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
}

function frame() {
  return screen.getByRole('dialog');
}

function frameRect() {
  const s = frame().style;
  return {
    left: parseFloat(s.left),
    top: parseFloat(s.top),
    width: parseFloat(s.width),
    height: parseFloat(s.height),
  };
}

function edge(name: string) {
  return document.querySelector(`[data-resize-edge="${name}"]`) as HTMLElement;
}

function header() {
  return screen.getByRole('heading', { name: 'By the way' }).closest('[data-window-header]') as HTMLElement;
}

describe('SideQuestionWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('content', () => {
    it('is titled by what /btw stands for', () => {
      setup();
      expect(screen.getByRole('heading', { name: 'By the way' })).toBeInTheDocument();
    });

    it('shows the empty state when there are no exchanges', () => {
      setup();
      expect(screen.getByText(/Ask anything about what is going on/)).toBeInTheDocument();
    });

    it('shows the question and a thinking indicator while pending', () => {
      setup({ exchanges: [exchange()] });
      expect(screen.getByText('why?')).toBeInTheDocument();
      expect(screen.getAllByText('Thinking…').length).toBeGreaterThan(0);
      expect(screen.queryByText(/Ask anything about what is going on/)).not.toBeInTheDocument();
    });

    it('shows the answer once answered', () => {
      setup({ exchanges: [exchange({ status: SideQuestionStatus.Answered, answer: 'because of reasons' })] });
      expect(screen.getByText('because of reasons')).toBeInTheDocument();
      expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
    });

    it('shows the error text when the question failed', () => {
      setup({ exchanges: [exchange({ status: SideQuestionStatus.Failed, answer: 'Command failed: boom' })] });
      expect(screen.getByText('Command failed: boom')).toBeInTheDocument();
    });

    it('shows a notice when the question failed without an error text', () => {
      setup({ exchanges: [exchange({ status: SideQuestionStatus.Failed })] });
      expect(screen.getByText(/Couldn't get an answer from Claude/)).toBeInTheDocument();
    });

    it('offers the clear button only when there are exchanges', () => {
      const { unmount } = setup();
      expect(screen.queryByLabelText('Clear side questions')).not.toBeInTheDocument();
      unmount();

      const { onClear } = setup({ exchanges: [exchange()] });
      fireEvent.click(screen.getByLabelText('Clear side questions'));
      expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('sends the typed text as a /btw command with the session mode, and clears the input', () => {
      setup();
      const box = document.querySelector('[contenteditable]') as HTMLElement;

      type(box, 'what is going on?');
      fireEvent.keyDown(box, { key: 'Enter' });

      expect(runControlRequestCommand).toHaveBeenCalledWith('/btw what is going on?', 'ask_before_edit');
      expect(box.textContent).toBe('');
    });
  });

  // The window floats over a chat the person keeps working in, so nothing about
  // it may grab the page: no scrim to click through, no Escape taken from the
  // chat's own use of it.
  describe('floating, not modal', () => {
    it('closes on Escape pressed inside the window', () => {
      const { onClose } = setup();
      fireEvent.keyDown(frame(), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('leaves Escape alone when it is pressed outside the window', () => {
      const { onClose } = setup();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('does not close when the page behind it is clicked', () => {
      const { onClose } = setup();
      fireEvent.click(document.body);
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes from its close button', () => {
      const { onClose } = setup();
      fireEvent.click(screen.getByLabelText('Close'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // A long answer must be read from its first line: scrolling to the bottom when
  // it arrives hides its beginning above the fold.
  describe('following the newest exchange', () => {
    afterEach(() => vi.restoreAllMocks());

    it('scrolls so the newest question is at the top of the list, not the end of its answer', () => {
      // Every exchange is 200px tall, laid out one under another.
      vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) {
        return Array.from(this.parentElement?.children ?? []).indexOf(this) * 200;
      });
      setup({
        exchanges: [
          exchange({ requestId: 'r1', question: 'first question', status: SideQuestionStatus.Answered, answer: 'one' }),
          exchange({ requestId: 'r2', question: 'second question', status: SideQuestionStatus.Answered, answer: 'two' }),
        ],
      });
      const list = screen.getByText('first question').closest('.overflow-y-auto') as HTMLElement;
      expect(list.scrollTop).toBe(200);
    });
  });

  describe('maximizing', () => {
    it('opens at its default size, centred', () => {
      setup();
      expect(frameRect()).toEqual(defaultRect(viewport));
    });

    it('fills the window leaving 1rem on every side', () => {
      setup();
      fireEvent.click(screen.getByLabelText('Maximize'));
      expect(frameRect()).toEqual(maximizedRect(viewport));
    });

    it('goes back to exactly where it was', () => {
      setup();
      const before = frameRect();
      fireEvent.click(screen.getByLabelText('Maximize'));
      fireEvent.click(screen.getByLabelText('Restore size'));
      expect(frameRect()).toEqual(before);
    });

    it('toggles on a double-click of the title bar', () => {
      setup();
      const before = frameRect();
      fireEvent.doubleClick(header());
      expect(frameRect()).toEqual(maximizedRect(viewport));
      fireEvent.doubleClick(header());
      expect(frameRect()).toEqual(before);
    });

    it('cannot be dragged or resized while maximized', () => {
      setup();
      fireEvent.click(screen.getByLabelText('Maximize'));
      expect(edge('e')).toBeNull();
      pointer('pointerdown', header(), 500, 100);
      pointer('pointermove', window, 560, 150);
      pointer('pointerup', window, 560, 150);
      expect(frameRect()).toEqual(maximizedRect(viewport));
    });
  });

  describe('moving', () => {
    it('follows the pointer by exactly the distance it travelled', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', header(), 500, 100);
      pointer('pointermove', window, 530, 120);
      pointer('pointermove', window, 560, 150);
      expect(frameRect()).toEqual({ ...before, left: before.left + 60, top: before.top + 50 });
    });

    it('stops following once the button is released', () => {
      setup();
      pointer('pointerdown', header(), 500, 100);
      pointer('pointermove', window, 560, 150);
      pointer('pointerup', window, 560, 150);
      const settled = frameRect();
      pointer('pointermove', window, 700, 300);
      expect(frameRect()).toEqual(settled);
    });

    it('does not start from a press on one of the title bar buttons', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', screen.getByLabelText('Close'), 500, 100);
      pointer('pointermove', window, 560, 150);
      expect(frameRect()).toEqual(before);
    });

    it('stays inside the viewport', () => {
      setup();
      pointer('pointerdown', header(), 500, 100);
      pointer('pointermove', window, -5000, -5000);
      const r = frameRect();
      expect(r.left).toBe(0);
      expect(r.top).toBe(0);
    });
  });

  describe('resizing from the edges', () => {
    it('has a handle on all four edges and all four corners', () => {
      setup();
      for (const name of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
        expect(edge(name), name).not.toBeNull();
      }
    });

    it('the east edge widens the window and leaves the left side where it is', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', edge('e'), 800, 300);
      pointer('pointermove', window, 860, 300);
      expect(frameRect()).toEqual({ ...before, width: before.width + 60 });
    });

    it('the west edge moves the left side and leaves the right side where it is', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', edge('w'), 200, 300);
      pointer('pointermove', window, 170, 300);
      const after = frameRect();
      expect(after.left).toBe(before.left - 30);
      expect(after.left + after.width).toBe(before.left + before.width);
    });

    it('the north edge moves the top and leaves the bottom where it is', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', edge('n'), 500, 200);
      pointer('pointermove', window, 500, 180);
      const after = frameRect();
      expect(after.top).toBe(before.top - 20);
      expect(after.top + after.height).toBe(before.top + before.height);
    });

    it('a corner changes width and height together', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', edge('se'), 800, 600);
      pointer('pointermove', window, 840, 630);
      expect(frameRect()).toEqual({ ...before, width: before.width + 40, height: before.height + 30 });
    });

    it('is a function of where the pointer is now, not of how it got there', () => {
      setup();
      pointer('pointerdown', edge('se'), 800, 600);
      pointer('pointermove', window, 900, 700);
      pointer('pointermove', window, 805, 605);
      const detour = frameRect();

      pointer('pointerup', window, 805, 605);
      expect(detour.width).toBe(defaultRect(viewport).width + 5);
      expect(detour.height).toBe(defaultRect(viewport).height + 5);
    });
  });

  // A transition on the size makes min/max glide, but during a drag it would
  // make the window chase the pointer instead of sitting under it.
  describe('smooth size changes', () => {
    it('glides between sizes when not being dragged', () => {
      setup();
      expect(frame().style.transition).toContain('width');
    });

    it('turns the glide off while the pointer holds an edge or the title bar', () => {
      setup();
      pointer('pointerdown', edge('e'), 800, 300);
      expect(frame().style.transition).toBe('none');
      pointer('pointerup', window, 800, 300);
      expect(frame().style.transition).toContain('width');

      pointer('pointerdown', header(), 500, 100);
      expect(frame().style.transition).toBe('none');
    });
  });

  describe('minimizing', () => {
    it('asks to be parked from its minimize button', () => {
      const { onMinimize } = setup();
      fireEvent.click(screen.getByLabelText('Minimize'));
      expect(onMinimize).toHaveBeenCalledTimes(1);
    });

    it('parks as a small floating button in the bottom-right corner', () => {
      setup({ isMinimized: true });
      const r = frameRect();
      expect(r.width).toBe(44);
      expect(r.height).toBe(44);
      expect(r.left + r.width).toBe(viewport.width - 16);
      expect(r.top + r.height).toBe(viewport.height - 8);
    });

    it('rests above the chat input, not on top of it', () => {
      const footer = document.createElement('div');
      footer.id = CHAT_FOOTER_ID;
      footer.getBoundingClientRect = () => ({ height: 100 }) as DOMRect;
      document.body.appendChild(footer);
      vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
      try {
        setup({ isMinimized: true });
        const r = frameRect();
        expect(r.top + r.height).toBe(viewport.height - 100 - 8);
      } finally {
        footer.remove();
        vi.unstubAllGlobals();
      }
    });

    it('is only the button: no title bar, no handles, none of the window buttons', () => {
      setup({ isMinimized: true, exchanges: [exchange()] });
      expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Minimize' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Maximize' })).not.toBeInTheDocument();
      expect(edge('e')).toBeNull();
    });

    it('cannot be typed into while parked', () => {
      setup({ isMinimized: true });
      const panel = document.querySelector('[data-window-panel]') as HTMLElement;
      expect(panel).toHaveAttribute('aria-hidden', 'true');
    });

    it('opens the window when the button is clicked', () => {
      const { onRestore, onClose } = setup({ isMinimized: true });
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
      expect(onRestore).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();
    });

    // The X appears on hover; it is always in the DOM so it can be reached by keyboard too.
    it('closes for good from the small X on the button, without also opening it', () => {
      const { onRestore, onClose } = setup({ isMinimized: true });
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onRestore).not.toHaveBeenCalled();
    });

    it('says an answer arrived while it was parked', () => {
      setup({ isMinimized: true, hasUnseen: true });
      expect(within(frame()).getByLabelText('New answer')).toBeInTheDocument();
    });

    it('says nothing when no answer arrived', () => {
      setup({ isMinimized: true });
      expect(screen.queryByLabelText('New answer')).not.toBeInTheDocument();
    });

    it('shows that a question is still being worked on', () => {
      setup({ isMinimized: true, exchanges: [exchange()] });
      expect(within(frame()).getByLabelText('Thinking…')).toBeInTheDocument();
    });

    it('is not moved by a press on the button', () => {
      setup({ isMinimized: true });
      const before = frameRect();
      pointer('pointerdown', screen.getByRole('button', { name: 'Open' }), 900, 740);
      pointer('pointermove', window, 400, 300);
      expect(frameRect()).toEqual(before);
    });
  });

  // The interface zoom is a CSS `zoom` on the root, so one layout pixel is
  // `scale` pixels of pointer travel and of window size. (Written after the
  // implementation, not before it.)
  describe('under interface zoom', () => {
    beforeEach(() => {
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
        // The 100px probe measures as 200px: the interface is zoomed to 200%.
        const width = (this as HTMLElement).style?.width === '100px' ? 200 : 0;
        return { width, height: 0, left: 0, top: 0, right: width, bottom: 0, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('lays the window out in zoomed pixels: maximized fills what the person sees', () => {
      setup();
      fireEvent.click(screen.getByLabelText('Maximize'));
      expect(frameRect()).toEqual(maximizedRect({ width: viewport.width / 2, height: viewport.height / 2 }));
    });

    it('moves by pointer travel divided by the zoom, so the window stays under the pointer', () => {
      setup();
      const before = frameRect();
      // The window is nearly as wide as the zoomed viewport, so keep the move
      // inside the 16px of room it has.
      pointer('pointerdown', header(), 500, 100);
      pointer('pointermove', window, 520, 150);
      expect(frameRect()).toEqual({ ...before, left: before.left + 10, top: before.top + 25 });
    });

    it('resizes by pointer travel divided by the zoom', () => {
      setup();
      const before = frameRect();
      pointer('pointerdown', edge('e'), 800, 300);
      pointer('pointermove', window, 820, 300);
      expect(frameRect()).toEqual({ ...before, width: before.width + 10 });
    });
  });

  afterEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
});
