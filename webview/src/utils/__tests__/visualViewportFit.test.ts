import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installVisualViewportFit, VV_FIT_ATTRIBUTE, writeVisualViewportVariables } from '../visualViewportFit';

/** A stand-in for `window.visualViewport` whose size the test sets and whose events it fires. */
class FakeVisualViewport extends EventTarget {
  height = 800;
  offsetTop = 0;
  scale = 1;
}

const root = () => document.documentElement;
const variable = (name: string) => root().style.getPropertyValue(name);

describe('visualViewportFit', () => {
  let vv: FakeVisualViewport;
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    vv = new FakeVisualViewport();
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    // Frames run when the test advances to them, as a browser runs them after the event.
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  });

  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
    root().style.removeProperty('--vv-height');
    root().style.removeProperty('--vv-top');
    vi.useRealTimers();
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
  });

  it('publishes the visible height and offset on install', () => {
    uninstall = installVisualViewportFit();

    expect(root().hasAttribute(VV_FIT_ATTRIBUTE)).toBe(true);
    expect(variable('--vv-height')).toBe('800px');
    expect(variable('--vv-top')).toBe('0px');
  });

  it('follows the keyboard opening and Safari panning the page', () => {
    uninstall = installVisualViewportFit();

    vv.height = 420;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersToNextFrame();
    expect(variable('--vv-height')).toBe('420px');

    vv.offsetTop = 260;
    vv.dispatchEvent(new Event('scroll'));
    vi.advanceTimersToNextFrame();
    expect(variable('--vv-top')).toBe('260px');
  });

  it('lets go of the frame while the reader pinch-zooms, and takes it back at normal scale', () => {
    uninstall = installVisualViewportFit();

    // Pinch-zoomed in: the visual viewport is a magnified part of the page, not the space the keyboard leaves.
    vv.scale = 2;
    vv.height = 400;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersToNextFrame();
    expect(root().hasAttribute(VV_FIT_ATTRIBUTE)).toBe(false);

    vv.scale = 1;
    vv.height = 800;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersToNextFrame();
    expect(root().hasAttribute(VV_FIT_ATTRIBUTE)).toBe(true);
    expect(variable('--vv-height')).toBe('800px');
  });

  it('never moves the frame above the page while Safari rubber-bands', () => {
    writeVisualViewportVariables({ height: 500, offsetTop: -12 });

    expect(variable('--vv-top')).toBe('0px');
  });

  it('removes the attribute and variables when uninstalled', () => {
    uninstall = installVisualViewportFit();
    uninstall();
    uninstall = undefined;

    expect(root().hasAttribute(VV_FIT_ATTRIBUTE)).toBe(false);
    expect(variable('--vv-height')).toBe('');
    expect(variable('--vv-top')).toBe('');

    vv.height = 300;
    vv.dispatchEvent(new Event('resize'));
    vi.advanceTimersToNextFrame();
    expect(variable('--vv-height')).toBe('');
  });

  it('does nothing where the browser has no visual viewport', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });

    uninstall = installVisualViewportFit();

    expect(root().hasAttribute(VV_FIT_ATTRIBUTE)).toBe(false);
    expect(variable('--vv-height')).toBe('');
  });
});
