import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollToSend, SEND_SCROLL_OPTIONS } from '../SendIndex/scrollToSend';

function section(key: string): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-send-section', key);
  const sentinel = document.createElement('div');
  sentinel.setAttribute('data-send-sentinel', '');
  wrapper.appendChild(sentinel);
  document.body.appendChild(wrapper);
  return sentinel;
}

describe('scrollToSend', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('scrolls the send into place', () => {
    const sentinel = section('s1');
    sentinel.scrollIntoView = vi.fn();

    expect(scrollToSend('s1')).toBe(true);
    expect(sentinel.scrollIntoView).toHaveBeenCalledWith(SEND_SCROLL_OPTIONS);
  });

  // Issue #701: the chat follows a streaming reply by writing the scroll position every frame, which cancels
  // the browser's smooth scroll. Following stops first, or the reply pulls the view back under the jump.
  it('stops the chat following the reply before it jumps', () => {
    const sentinel = section('s1');
    sentinel.scrollIntoView = vi.fn();
    const releaseFollow = vi.fn();

    scrollToSend('s1', releaseFollow);

    expect(releaseFollow).toHaveBeenCalledTimes(1);
    expect(releaseFollow.mock.invocationCallOrder[0])
      .toBeLessThan((sentinel.scrollIntoView as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it('leaves following alone when the send is not in the transcript, since nothing moves', () => {
    const releaseFollow = vi.fn();

    expect(scrollToSend('missing', releaseFollow)).toBe(false);
    expect(releaseFollow).not.toHaveBeenCalled();
  });
});
