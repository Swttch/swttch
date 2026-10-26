import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FilePreviewPane } from '../index';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { PAGE_BACKGROUND_MESSAGE } from '../pageBackground';
import { PAGE_LINK_MESSAGE } from '../pageLinks';
import { _resetPageTitles } from '../BrowserPane';

const openUrl = vi.fn(() => Promise.resolve());
const openFileWithSystemApp = vi.fn(() => Promise.resolve());
const { request, source } = vi.hoisted(() => ({ request: vi.fn(), source: { value: 'local' as 'local' | 'remote' } }));

vi.mock('../pageFrame', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pageFrame')>()),
  pageSource: () => source.value,
}));
vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openUrl, openFileWithSystemApp, openFile: vi.fn(() => Promise.resolve()) }),
}));
vi.mock('@/api/bridge/Bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/bridge/Bridge')>()),
  getBridge: () => ({ request }),
}));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    i18n: { language: 'en' },
  }),
}));

const b64 = (text: string) => btoa(text);
const page = (title: string) => ({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64(`<title>${title}</title><h1>hi</h1>`) });

beforeEach(() => {
  _resetPageTitles();
  source.value = 'local';
  request.mockReset();
  openUrl.mockClear();
  openFileWithSystemApp.mockClear();
  filePreviewPaneStore.close();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

// A tab carries the page's own name once the page has been read; until then it carries the file's name, so
// "a" is the tab of /p/a.html that was opened and left before its page was read.
async function openPages(...files: Array<[string, string]>) {
  request.mockImplementation((type: string, params: { path: string }) => {
    if (type === 'GET_DEFAULT_BROWSER') return Promise.resolve({ name: 'Google Chrome' });
    if (type === 'GET_FAVICON') return Promise.resolve({ icon: null });
    const found = files.find(([path]) => params.path.replace(/\\/g, '/') === path);
    return Promise.resolve(page(found ? found[1] : 'Unknown'));
  });
  render(<FilePreviewPane />);
  for (const [path] of files) act(() => filePreviewPaneStore.open(path));
  await screen.findByTitle(files[files.length - 1][0].split('/').pop()!);
}

describe('the browser pane (a page in a file on this machine)', () => {
  it('opens the page in a tab named by its own title, with the file\'s path as the address, and no way to its source', async () => {
    await openPages(['/p/page.html', 'Images']);
    expect(screen.getByRole('tab', { name: /Images/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'filePreview.address' })).toHaveValue('/p/page.html');
    expect(screen.queryByRole('button', { name: 'filePreview.showSource' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^…? ?\/? ?p \/ page\.html$/)).not.toBeInTheDocument();
  });

  it('keeps a tab for each file opened and shows the one picked', async () => {
    await openPages(['/p/a.html', 'Alpha'], ['/p/b.html', 'Beta']);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /Beta/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'a' }));
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/a.html' });
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'filePreview.address' })).toHaveValue('/p/a.html'));
  });

  it('closes a tab with its ×, shows the neighbour, and closes the pane with the last', async () => {
    await openPages(['/p/a.html', 'Alpha'], ['/p/b.html', 'Beta']);
    const closers = screen.getAllByRole('button', { name: 'filePreview.closeTab' });
    fireEvent.click(closers[1]);
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/a.html' });
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.closeTab' }));
    expect(filePreviewPaneStore.get()).toBeNull();
  });

  it('closes the other tabs from a right click on one', async () => {
    await openPages(['/p/a.html', 'Alpha'], ['/p/b.html', 'Beta']);
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'a' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'filePreview.closeOthers' }));
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/a.html' });
  });

  it('goes to another file typed into the address, and back and forward between them', async () => {
    await openPages(['/p/a.html', 'Alpha'], ['/p/b.html', 'Beta']);
    fireEvent.click(screen.getByRole('tab', { name: 'a' }));
    const back = screen.getByRole('button', { name: 'filePreview.back' });
    const forward = screen.getByRole('button', { name: 'filePreview.forward' });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();

    const address = screen.getByRole('textbox', { name: 'filePreview.address' });
    fireEvent.change(address, { target: { value: '/p/b.html' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    await waitFor(() => expect(filePreviewPaneStore.get()).toEqual({ path: '/p/b.html' }));
    expect(screen.getByRole('button', { name: 'filePreview.back' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'filePreview.back' }));
    await waitFor(() => expect(filePreviewPaneStore.get()).toEqual({ path: '/p/a.html' }));
    expect(screen.getByRole('button', { name: 'filePreview.forward' })).toBeEnabled();
  });

  it('reads a relative address from the folder of the shown page', async () => {
    await openPages(['/p/sub/a.html', 'Alpha']);
    const address = screen.getByRole('textbox', { name: 'filePreview.address' });
    fireEvent.change(address, { target: { value: '../b.html' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    await waitFor(() => expect(filePreviewPaneStore.get()).toEqual({ path: '/p/b.html' }));
  });

  it('shows a web address typed into the address in the tab, with the warning that Claude cannot support it', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    const address = screen.getByRole('textbox', { name: 'filePreview.address' });
    fireEvent.change(address, { target: { value: 'https://example.com/x' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    await waitFor(() => expect(filePreviewPaneStore.get()).toEqual({ path: 'https://example.com/x' }));
    expect(await screen.findByText('filePreview.webUnsupported')).toBeInTheDocument();
    expect((screen.getByTitle('Example') as HTMLIFrameElement).getAttribute('src')).toBe('https://example.com/x');
    expect(screen.getByRole('textbox', { name: 'filePreview.address' })).toHaveValue('example.com/x');
  });

  it('takes a site named without its scheme as a web address', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    const address = screen.getByRole('textbox', { name: 'filePreview.address' });
    fireEvent.change(address, { target: { value: 'www.naver.com' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    await waitFor(() => expect(filePreviewPaneStore.get()).toEqual({ path: 'https://www.naver.com' }));
  });

  it('asks where to open a link out of the page, and does nothing on cancel', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    const frame = screen.getByTitle('a.html') as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type: PAGE_LINK_MESSAGE, url: 'https://example.com/a' } }));
    });
    fireEvent.click(await screen.findByRole('button', { name: 'common.cancel' }).catch(() => screen.getByRole('button', { name: /cancel/i })));
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('paints the card in the colour the page reports', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    const frame = screen.getByTitle('a.html') as HTMLIFrameElement;
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data: { type: PAGE_BACKGROUND_MESSAGE, color: 'rgb(26, 26, 26)' } }));
    });
    expect(screen.getByRole('complementary').style.backgroundColor).toBe('rgb(26, 26, 26)');
  });

  it('is not the pane for a page on another machine or a published Artifact', async () => {
    source.value = 'remote';
    request.mockResolvedValue(page('Remote'));
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/a.html'));
    await screen.findByText(/<title>Remote<\/title>/);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});

describe('the browser pane\'s new tab, menu and annotation', () => {
  it('opens a blank tab from "+", which takes an address typed into it to a file', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.newTab' }));
    expect(screen.getByText('filePreview.blankBody')).toBeInTheDocument();
    const address = screen.getByRole('textbox', { name: 'filePreview.address' });
    expect(address).toHaveValue('');
    fireEvent.change(address, { target: { value: '/p/a.html' } });
    fireEvent.keyDown(address, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByText('filePreview.blankBody')).not.toBeInTheDocument());
  });

  it('has the Desktop menu, in its order, with what needs a browser engine dimmed', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.more' }));
    const opener = 'filePreview.menu.openInBrowser:{"browser":"Google Chrome"}';
    await screen.findByRole('menuitem', { name: opener });
    const items = await screen.findAllByRole('menuitem');
    expect(items.slice(0, 4).map((i) => i.textContent)).toEqual([
      opener, 'filePreview.menu.copyUrl', 'filePreview.menu.saveScreenshot', 'filePreview.menu.showAnnotate',
    ]);
    expect(screen.getByRole('menuitem', { name: 'filePreview.menu.saveScreenshot' })).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByRole('menuitem', { name: 'filePreview.menu.importCookies' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitemcheckbox', { name: 'filePreview.menu.autoCheck' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('menuitem', { name: opener }));
    expect(openFileWithSystemApp).toHaveBeenCalledWith('/p/a.html');
  });

  it('shows the annotation bar with its tools from the annotate button, and takes it away with its exit', async () => {
    await openPages(['/p/a.html', 'Alpha']);
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.more' }));
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'filePreview.menu.showAnnotate' })).toHaveAttribute('aria-disabled', 'false'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'filePreview.menu.showAnnotate' }));
    const bar = screen.getByRole('toolbar', { name: 'filePreview.annotate' });
    expect(Array.from(bar.querySelectorAll('button')).map((b) => b.getAttribute('aria-label')).slice(0, 4)).toEqual([
      'filePreview.selectElement', 'filePreview.annotatePen', 'filePreview.annotateShape', 'filePreview.annotateShapes',
    ]);
    expect(screen.getByTestId('annotate-canvas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.annotateExit' }));
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });
});
