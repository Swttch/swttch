import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { _resetRuntimeCache } from '@/config/environment';
import { i18n } from '@/i18n';
import { installExternalLinkRouting } from '../externalLinkRouting';

const openUrl = vi.fn((_url: string) => Promise.resolve());

vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openUrl }),
}));

function addLink(attrs: Record<string, string>, label = 'link'): HTMLAnchorElement {
  const anchor = document.createElement('a');
  for (const [name, value] of Object.entries(attrs)) anchor.setAttribute(name, value);
  const inner = document.createElement('span');
  inner.textContent = label;
  anchor.appendChild(inner);
  document.body.appendChild(anchor);
  return anchor;
}

/** Dispatches the event and reports whether its default action was left alone. */
function fire(target: Element, type: 'click' | 'auxclick', button: number, init: MouseEventInit = {}): boolean {
  return target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button, ...init }));
}

describe('installExternalLinkRouting', () => {
  let uninstall: () => void;

  beforeEach(() => {
    openUrl.mockClear();
    (window as unknown as { __JCEF__?: boolean }).__JCEF__ = true;
    _resetRuntimeCache();
    uninstall = installExternalLinkRouting();
  });

  afterEach(() => {
    uninstall();
    document.body.innerHTML = '';
    delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
    _resetRuntimeCache();
  });

  it('opens an external link through the adapter on a primary click', () => {
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    expect(fire(link, 'click', 0)).toBe(false);
    expect(openUrl).toHaveBeenCalledWith('https://example.com/a');
  });

  it('opens an external link on a middle click, which fires auxclick and not click', () => {
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    expect(fire(link, 'auxclick', 1)).toBe(false);
    expect(openUrl).toHaveBeenCalledTimes(1);
  });

  it('opens an external link on ctrl+click', () => {
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    expect(fire(link, 'click', 0, { ctrlKey: true })).toBe(false);
    expect(openUrl).toHaveBeenCalledTimes(1);
  });

  it('routes a click on an element inside the link, not only on the anchor itself', () => {
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    fire(link.querySelector('span')!, 'click', 0);
    expect(openUrl).toHaveBeenCalledTimes(1);
  });

  it('routes an external link that has no target, since it would navigate the chat tab too', () => {
    const link = addLink({ href: 'https://example.com/a' });
    expect(fire(link, 'click', 0)).toBe(false);
    expect(openUrl).toHaveBeenCalledTimes(1);
  });

  it('leaves the right button alone so the context menu still works', () => {
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    expect(fire(link, 'auxclick', 2)).toBe(true);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('leaves in-page anchors alone', () => {
    const link = addLink({ href: '#section' });
    expect(fire(link, 'click', 0)).toBe(true);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('leaves a link to our own origin alone', () => {
    const link = addLink({ href: `${window.location.origin}/settings/general` });
    expect(fire(link, 'click', 0)).toBe(true);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('does nothing when the click was already handled by the link itself', () => {
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    link.addEventListener('click', (event) => event.preventDefault());
    fire(link, 'click', 0);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('does nothing outside the IDE, where the browser opens the link itself', () => {
    delete (window as unknown as { __JCEF__?: boolean }).__JCEF__;
    _resetRuntimeCache();
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    expect(fire(link, 'click', 0)).toBe(true);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('stops routing after it is uninstalled', () => {
    uninstall();
    const link = addLink({ href: 'https://example.com/a', target: '_blank' });
    fire(link, 'click', 0);
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('tells the user when the link could not be opened (#567)', async () => {
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('id');
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openUrl.mockRejectedValueOnce(new Error('no browser'));
    fire(addLink({ href: 'https://example.com/a', target: '_blank' }), 'click', 0);
    await vi.waitFor(() => expect(errorToast).toHaveBeenCalledWith(i18n.t('chat:externalLink.openFailed')));
    errorToast.mockRestore();
    errorLog.mockRestore();
  });
});
