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

  /** A send `top` pixels from the top of a chat 600 pixels tall. */
  function sendAt(top: number): HTMLElement {
    const sentinel = section('s1');
    const chat = document.createElement('div');
    chat.setAttribute('data-chat-scroll', '');
    Object.defineProperty(chat, 'clientHeight', { value: 600 });
    chat.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    document.body.append(chat);
    chat.append(sentinel.parentElement!);
    sentinel.getBoundingClientRect = () => ({ top }) as DOMRect;
    sentinel.scrollIntoView = vi.fn();
    return sentinel;
  }
  const atOnce = { ...SEND_SCROLL_OPTIONS, behavior: 'instant' };

  it.each([-900, 1100])('glides a short way (%s)', (top) => {
    const sentinel = sendAt(top);
    scrollToSend('s1');
    expect(sentinel.scrollIntoView).toHaveBeenCalledWith(SEND_SCROLL_OPTIONS);
  });

  // #747. A glide over pages that come and go while it is on its way is stopped by the first of them, short of the send.
  it.each([-30000, 1300])('goes at once a long way (%s)', (top) => {
    const sentinel = sendAt(top);
    scrollToSend('s1');
    expect(sentinel.scrollIntoView).toHaveBeenCalledWith(atOnce);
  });

  it('goes at once to a send that was just loaded for, however near it is', () => {
    const sentinel = sendAt(100);
    scrollToSend('s1', undefined, true);
    expect(sentinel.scrollIntoView).toHaveBeenCalledWith(atOnce);
  });

  /** The mark of the stretch the window does not hold, `top` pixels from the top of the chat. */
  function gapAt(top: number): void {
    const gap = document.createElement('div');
    gap.setAttribute('data-window-gap', '');
    gap.getBoundingClientRect = () => ({ top }) as DOMRect;
    document.querySelector('[data-chat-scroll]')!.append(gap);
  }

  // #708. A send past the stretch not held looks near, and is not: the stretch fills while a glide crosses it.
  it.each([
    [1100, 700],
    [-900, -300],
  ])('goes at once to a send (%s) with a stretch not held on the way (%s)', (top, gap) => {
    const sentinel = sendAt(top);
    gapAt(gap);
    scrollToSend('s1');
    expect(sentinel.scrollIntoView).toHaveBeenCalledWith(atOnce);
  });

  it.each([
    [1100, 1500],
    [1100, -300],
    [-900, 700],
  ])('glides a short way (%s) when the stretch not held is elsewhere (%s)', (top, gap) => {
    const sentinel = sendAt(top);
    gapAt(gap);
    scrollToSend('s1');
    expect(sentinel.scrollIntoView).toHaveBeenCalledWith(SEND_SCROLL_OPTIONS);
  });

  const frames = (n: number) =>
    new Promise<void>((done) => {
      const next = (left: number) => (left === 0 ? done() : requestAnimationFrame(() => next(left - 1)));
      next(n);
    });

  it('puts a send it went to at once there again when something moves it right after', async () => {
    const sentinel = sendAt(-30000);
    scrollToSend('s1');
    await frames(3);
    expect(sentinel.scrollIntoView).toHaveBeenCalledTimes(1);

    sentinel.getBoundingClientRect = () => ({ top: 130 }) as DOMRect;
    await frames(3);

    expect(sentinel.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(sentinel.scrollIntoView).toHaveBeenLastCalledWith(atOnce);
  });

  it.each(['wheel', 'touchstart', 'pointerdown', 'keydown'])('lets go as soon as the reader takes the page over (%s)', async (event) => {
    const sentinel = sendAt(-30000);
    scrollToSend('s1');

    window.dispatchEvent(new Event(event));
    sentinel.getBoundingClientRect = () => ({ top: 900 }) as DOMRect;
    await frames(3);

    expect(sentinel.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  // #708. A page that lands during a glide moves the scroll position to keep the reader's place, which ends the glide.
  it('finishes a glide that stopped short of the send', async () => {
    const sentinel = sendAt(1100);
    scrollToSend('s1');

    sentinel.getBoundingClientRect = () => ({ top: 600 }) as DOMRect;
    await frames(30);

    expect(sentinel.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(sentinel.scrollIntoView).toHaveBeenLastCalledWith(atOnce);
  });

  it('leaves a glide that is still on its way alone', async () => {
    const sentinel = sendAt(1100);
    let top = 1100;
    sentinel.getBoundingClientRect = () => ({ top: (top -= 20) }) as DOMRect;
    scrollToSend('s1');

    await frames(30);

    expect(sentinel.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('leaves a stopped glide alone once the reader took the page over', async () => {
    const sentinel = sendAt(1100);
    scrollToSend('s1');

    window.dispatchEvent(new Event('wheel'));
    sentinel.getBoundingClientRect = () => ({ top: 600 }) as DOMRect;
    await frames(30);

    expect(sentinel.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  // #708. A page landing can draw the section anew, with a sentinel that is another element.
  it('keeps going to the send when its section is drawn anew on the way', async () => {
    const sentinel = sendAt(1100);
    scrollToSend('s1');

    const anew = document.createElement('div');
    anew.setAttribute('data-send-sentinel', '');
    anew.getBoundingClientRect = () => ({ top: 600 }) as DOMRect;
    anew.scrollIntoView = vi.fn();
    sentinel.replaceWith(anew);
    await frames(30);

    expect(anew.scrollIntoView).toHaveBeenLastCalledWith(atOnce);
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
