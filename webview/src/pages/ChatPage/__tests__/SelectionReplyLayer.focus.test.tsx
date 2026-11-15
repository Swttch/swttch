import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { createRef } from 'react';
import { SelectionReplyLayer } from '../SelectionReply/SelectionReplyLayer';

// Saving a comment on selected text puts the reply in the message box, and the reader goes on writing there.

const focusComposer = vi.fn();
const addReplyToComposer = vi.fn();

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/contexts/SideQuestionContext', () => ({
  useOptionalSideQuestions: () => null,
}));
vi.mock('@/contexts/ChatInputFocusContext', () => ({
  useChatInputFocus: () => ({ textareaRef: { current: null }, focus: focusComposer }),
}));
vi.mock('@/utils/composerReplies', () => ({
  addReplyToComposer: (...args: unknown[]) => addReplyToComposer(...args),
}));

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

describe('SelectionReplyLayer hands the focus back to the message box after a comment is saved', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] });
    Range.prototype.getBoundingClientRect = (() => ({ top: 300, bottom: 320, left: 10, right: 110, width: 100, height: 20, x: 10, y: 300 })) as unknown as () => DOMRect;
    focusComposer.mockClear();
    addReplyToComposer.mockClear();
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    vi.useRealTimers();
  });

  function open() {
    const containerRef = createRef<HTMLDivElement>();
    const view = render(
      <div ref={containerRef}>
        <p>hello selected world</p>
        <SelectionReplyLayer containerRef={containerRef} />
      </div>,
    );
    selectTranscriptText(view.container.querySelector('p')!.firstChild as Text);
    fireEvent.click(view.getByText('selectionReply.reply'));
    return view;
  }

  it('focuses the message box once the card has left, not while it is still there', () => {
    const view = open();
    const box = view.container.querySelector('textarea')!;
    fireEvent.change(box, { target: { value: 'my comment' } });
    fireEvent.keyDown(box, { key: 'Enter' });

    expect(addReplyToComposer).toHaveBeenCalledWith('hello selected world', 'my comment', false);
    expect(view.container.querySelector('textarea')).toBeNull();
    expect(focusComposer).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(focusComposer).toHaveBeenCalledTimes(1);
  });

  it('does not take the focus when the card is cancelled', () => {
    const view = open();
    const box = view.container.querySelector('textarea')!;
    fireEvent.keyDown(box, { key: 'Escape' });
    act(() => {
      vi.advanceTimersByTime(5);
    });
    expect(focusComposer).not.toHaveBeenCalled();
  });
});
