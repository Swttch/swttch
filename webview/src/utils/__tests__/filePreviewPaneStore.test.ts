import { describe, it, expect, beforeEach } from 'vitest';
import { filePreviewPaneStore as store } from '../filePreviewPaneStore';

beforeEach(() => store.close());

describe('the tabs', () => {
  it('adds a tab for each file opened, and brings forward the tab of a file opened again', () => {
    store.open('/p/a.html');
    store.open('/p/b.html');
    expect(store.getTabs().map((t) => t.path)).toEqual(['/p/a.html', '/p/b.html']);
    expect(store.get()).toEqual({ path: '/p/b.html' });
    store.open('/p/a.html');
    expect(store.getTabs()).toHaveLength(2);
    expect(store.get()).toEqual({ path: '/p/a.html' });
  });

  it('does not make a tab of a published Artifact', () => {
    store.open('/p/a.html');
    store.open('/p/art.html', 'https://claude.ai/artifact/x');
    expect(store.getTabs().map((t) => t.path)).toEqual(['/p/a.html']);
    expect(store.getActiveTabId()).toBeNull();
    expect(store.get()).toEqual({ path: '/p/art.html', publishedUrl: 'https://claude.ai/artifact/x' });
  });

  it('shows the neighbour when the shown tab is closed, and closes the pane with the last tab', () => {
    store.open('/p/a.html');
    store.open('/p/b.html');
    store.open('/p/c.html');
    const [a, b, c] = store.getTabs();
    store.closeTab(c.id);
    expect(store.get()).toEqual({ path: '/p/b.html' });
    store.closeTab(a.id);
    expect(store.get()).toEqual({ path: '/p/b.html' });
    store.closeTab(b.id);
    expect(store.get()).toBeNull();
    expect(store.getTabs()).toEqual([]);
  });

  it('keeps the shown tab when another is closed, and keeps only one on "close others"', () => {
    store.open('/p/a.html');
    store.open('/p/b.html');
    const [a, b] = store.getTabs();
    store.closeTab(a.id);
    expect(store.get()).toEqual({ path: '/p/b.html' });
    store.open('/p/c.html');
    store.closeOtherTabs(b.id);
    expect(store.getTabs().map((t) => t.path)).toEqual(['/p/b.html']);
    expect(store.get()).toEqual({ path: '/p/b.html' });
  });

  it('takes a tab to another file in place, and hands out the same array until something changes', () => {
    store.open('/p/a.html');
    const [a] = store.getTabs();
    const before = store.getTabs();
    expect(store.getTabs()).toBe(before);
    store.navigateTab(a.id, '/p/z.html');
    expect(store.getTabs()).toEqual([{ id: a.id, path: '/p/z.html' }]);
    expect(store.get()).toEqual({ path: '/p/z.html' });
  });
});

describe('a blank tab', () => {
  it('is a tab with no page, which an address typed into it takes to a file', () => {
    store.open('/p/a.html');
    store.openBlankTab();
    expect(store.getTabs().map((t) => t.path)).toEqual(['/p/a.html', '']);
    expect(store.get()).toEqual({ path: '' });
    const blank = store.getTabs()[1];
    store.navigateTab(blank.id, '/p/b.html');
    expect(store.get()).toEqual({ path: '/p/b.html' });
  });
});

describe('the dock\'s browser button', () => {
  it('opens the pane on a new tab, and closes it when it is open', () => {
    store.close();
    store.toggleBrowser();
    expect(store.get()).toEqual({ path: '' });
    expect(store.getTabs()).toHaveLength(1);
    store.toggleBrowser();
    expect(store.get()).toBeNull();
    expect(store.getTabs()).toHaveLength(0);
  });
});
