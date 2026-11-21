import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserAdapter } from '../BrowserAdapter';
import { normalizeTabPath } from '../tabPath';

vi.mock('../../api/bridge/Bridge', () => ({ getBridge: () => ({ request: vi.fn() }) }));

describe('normalizeTabPath', () => {
  it('leaves out the query, a leading # and a trailing slash', () => {
    expect(normalizeTabPath('/sessions/abc?workingDir=%2Fp')).toBe('/sessions/abc');
    expect(normalizeTabPath('#/settings/general')).toBe('/settings/general');
    expect(normalizeTabPath('/settings/general/')).toBe('/settings/general');
  });

  it('keeps two different pages apart', () => {
    expect(normalizeTabPath('/settings/sponsor')).not.toBe(normalizeTabPath('/settings/general'));
  });
});

describe('BrowserAdapter tabs', () => {
  const open = vi.fn();
  let adapter: BrowserAdapter;

  const fakeWindow = () => ({ closed: false, focus: vi.fn() }) as unknown as Window & { focus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    open.mockReset();
    vi.stubGlobal('open', open);
    adapter = new BrowserAdapter();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('newTab opens a browser tab every time, whatever is open already', async () => {
    open.mockReturnValue(fakeWindow());
    await adapter.newTab();
    await adapter.newTab();

    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[0][0]).toContain('/sessions/new');
    expect(open.mock.calls[0][1]).toBe('_blank');
  });

  it('openTab goes to the tab it opened for the same page instead of opening a copy', async () => {
    const win = fakeWindow();
    open.mockReturnValue(win);

    await adapter.openTab('/agent/s-reuse/toolu_1');
    await adapter.openTab('/agent/s-reuse/toolu_1?workingDir=%2Fother');

    expect(open).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it('openTab opens a separate tab for a different page', async () => {
    open.mockReturnValue(fakeWindow());

    await adapter.openTab('/agent/s-diff/toolu_1');
    await adapter.openTab('/agent/s-diff/toolu_2');

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('openTab opens again once the tab it opened has been closed', async () => {
    const closed = { ...fakeWindow(), closed: true } as unknown as Window;
    open.mockReturnValueOnce(closed).mockReturnValueOnce(fakeWindow());

    await adapter.openTab('/agent/s-closed/toolu_1');
    await adapter.openTab('/agent/s-closed/toolu_1');

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('openTab carries the project directory of a page that is not this one', async () => {
    open.mockReturnValue(fakeWindow());
    await adapter.openTab('/sessions/xyz', '/elsewhere/proj');

    expect(open.mock.calls[0][0]).toContain('workingDir=%2Felsewhere%2Fproj');
  });

  it('openTab reports a blocked pop-up', async () => {
    open.mockReturnValue(null);
    await expect(adapter.openTab('/sessions/blocked')).rejects.toThrow(/Pop-up/);
  });
});
