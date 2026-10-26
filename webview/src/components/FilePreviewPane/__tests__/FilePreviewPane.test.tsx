import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { FilePreviewPane } from '../index';
import { decodeText, loadFileContent } from '../loadFileContent';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';
import { isLightColor, PAGE_BACKGROUND_MESSAGE, withBackgroundProbe } from '../pageBackground';

const openFile = vi.fn(() => Promise.resolve());
const openFileWithSystemApp = vi.fn(() => Promise.resolve());
const openUrl = vi.fn(() => Promise.resolve());
const request = vi.fn();

vi.mock('@/adapters', () => ({ getAdapter: () => ({ openFile, openFileWithSystemApp, openUrl }) }));
vi.mock('@/api/bridge/Bridge', () => ({ getBridge: () => ({ request }) }));
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }));
vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  }),
}));

/** The fixtures are ASCII, so btoa spells them without Node's Buffer. */
const b64 = (text: string) => btoa(text);

/** What the pane offers for the file lives in the menu under its title. */
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /./, expanded: false }));

beforeEach(() => {
  request.mockReset();
  openFile.mockClear();
  openFileWithSystemApp.mockClear();
  openUrl.mockClear();
  filePreviewPaneStore.close();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('loadFileContent', () => {
  it('asks piece by piece and joins them into one blob', async () => {
    request
      .mockResolvedValueOnce({ ok: true, kind: 'video', mimeType: 'video/mp4', size: 6, offset: 0, base64: b64('abc') })
      .mockResolvedValueOnce({ ok: true, kind: 'video', mimeType: 'video/mp4', size: 6, offset: 3, base64: b64('def') });

    const result = await loadFileContent('/p/v.mp4');

    expect(request.mock.calls.map((call) => call[1])).toEqual([
      { path: '/p/v.mp4', offset: 0 },
      { path: '/p/v.mp4', offset: 3 },
    ]);
    if (!result.ok) throw new Error('expected the file to load');
    expect(result.kind).toBe('video');
    expect(decodeText(result.pieces)).toBe('abcdef');
    expect(result.blob.size).toBe(6);
    expect(result.blob.type).toBe('video/mp4');
  });

  it('passes the backend\'s reason through, with the sizes of a file that is too large', async () => {
    request.mockResolvedValueOnce({ ok: false, reason: 'tooLarge', size: 9, maxBytes: 5 });
    expect(await loadFileContent('/p/a.html')).toEqual({ ok: false, reason: 'tooLarge', size: 9, maxBytes: 5 });
  });

  it('stops asking once cancelled', async () => {
    request.mockResolvedValue({ ok: true, kind: 'video', mimeType: 'video/mp4', size: 100, offset: 0, base64: b64('abc') });
    await loadFileContent('/p/v.mp4', () => true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('answers unreadable when the connection fails, and when the file shrinks mid-read', async () => {
    request.mockRejectedValueOnce(new Error('socket closed'));
    expect(await loadFileContent('/p/a.pdf')).toEqual({ ok: false, reason: 'unreadable' });

    request.mockReset();
    request
      .mockResolvedValueOnce({ ok: true, kind: 'pdf', mimeType: 'application/pdf', size: 10, offset: 0, base64: b64('abc') })
      .mockResolvedValueOnce({ ok: true, kind: 'pdf', mimeType: 'application/pdf', size: 10, offset: 3, base64: '' });
    const result = await loadFileContent('/p/a.pdf');
    expect(result.ok).toBe(true);
  });
});

describe('decodeText', () => {
  it('keeps a character that straddles two pieces whole', () => {
    const bytes = new TextEncoder().encode('가');
    expect(decodeText([bytes.slice(0, 1), bytes.slice(1)])).toBe('가');
  });
});

describe('FilePreviewPane', () => {
  it('renders nothing while no file is open', () => {
    const { container } = render(<FilePreviewPane />);
    expect(container).toBeEmptyDOMElement();
  });

  it('draws a page in a frame that has no access to the chat page', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));

    const frame = await screen.findByTitle('page.html');
    expect(frame.getAttribute('srcdoc')).toContain('<h1>hi</h1>');
    const sandbox = frame.getAttribute('sandbox') ?? '';
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
  });

  // A white sheet that flashes before the page paints reads as a glitch: a spinner stands in until the page is there.
  it('shows a spinner while the page is read, and none once it is drawn', async () => {
    let answer!: (value: unknown) => void;
    request.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => answer({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') }));
    const frame = await screen.findByTitle('page.html');
    fireEvent.load(frame);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(frame.className).not.toContain('invisible');
  });

  it('offers the published address of a page the agent published', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/abc'));

    await screen.findByTitle('page.html');
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'filePreview.openPublished' }));
    expect(openUrl).toHaveBeenCalledWith('https://claude.ai/artifact/abc');
  });

  it('expands over the chat and folds back, and closing forgets the expansion', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    await screen.findByTitle('page.html');

    fireEvent.click(screen.getByRole('button', { name: 'filePreview.expand' }));
    expect(filePreviewPaneStore.isExpanded()).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.collapse' }));
    expect(filePreviewPaneStore.isExpanded()).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'filePreview.expand' }));
    act(() => filePreviewPaneStore.close());
    expect(filePreviewPaneStore.isExpanded()).toBe(false);
  });

  it.each([
    ['image', 'shot.png', 'image/png', 'img'],
    ['video', 'clip.mp4', 'video/mp4', 'video'],
  ])('draws %s from the loaded bytes', async (kind, file, mimeType, selector) => {
    request.mockResolvedValue({ ok: true, kind, mimeType, size: 3, offset: 0, base64: b64('abc') });
    const { container } = render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open(`/p/${file}`));
    await waitFor(() => expect(container.querySelector(selector)?.getAttribute('src')).toBe('blob:preview'));
  });

  // Measured in the IDE 2024.2.6: its browser has no H.264 decoder, the player appears but fails
  // with "no supported streams", so the pane must say so instead of leaving a dead player.
  it('says a video cannot be played when the player fails, and keeps the system app one click away', async () => {
    request.mockResolvedValue({ ok: true, kind: 'video', mimeType: 'video/mp4', size: 3, offset: 0, base64: b64('abc') });
    const { container } = render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/clip.mp4'));
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());

    fireEvent.error(container.querySelector('video')!);

    expect(await screen.findByText('filePreview.unplayable')).toBeInTheDocument();
    expect(container.querySelector('video')).toBeNull();
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'filePreview.openWithSystemApp'}));
    expect(openFileWithSystemApp).toHaveBeenCalledWith('/p/clip.mp4');
  });

  it('draws a PDF in a frame and releases the bytes when the pane closes', async () => {
    request.mockResolvedValue({ ok: true, kind: 'pdf', mimeType: 'application/pdf', size: 3, offset: 0, base64: b64('abc') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/doc.pdf'));
    const frame = await screen.findByTitle('doc.pdf');
    expect(frame.getAttribute('src')).toBe('blob:preview');

    act(() => filePreviewPaneStore.close());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(screen.queryByTitle('doc.pdf')).toBeNull();
  });

  it('says why a file cannot be shown, with its size against the limit', async () => {
    request.mockResolvedValue({ ok: false, reason: 'tooLarge', size: 12_000_000, maxBytes: 10_000_000 });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/huge.png'));
    expect(await screen.findByText(/filePreview\.tooLarge/)).toHaveTextContent('12MB');
    expect(screen.getByText(/filePreview\.tooLarge/)).toHaveTextContent('10MB');
  });

  it('says a file it could not read, and keeps the editor one click away', async () => {
    request.mockResolvedValue({ ok: false, reason: 'unreadable' });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/gone.pdf'));
    expect(await screen.findByText('filePreview.unreadable')).toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'filePreview.openInEditor'}));
    expect(openFile).toHaveBeenCalledWith('/p/gone.pdf');
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', {name: 'filePreview.openWithSystemApp'}));
    expect(openFileWithSystemApp).toHaveBeenCalledWith('/p/gone.pdf');
  });

  it('closes with the button and with Escape', async () => {
    request.mockResolvedValue({ ok: false, reason: 'unsupported' });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/a.pdf'));
    await screen.findByText('filePreview.unsupported');

    fireEvent.click(screen.getByLabelText('filePreview.close'));
    expect(filePreviewPaneStore.get()).toBeNull();

    act(() => filePreviewPaneStore.open('/p/a.pdf'));
    await screen.findByText('filePreview.unsupported');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(filePreviewPaneStore.get()).toBeNull();
  });

  it('shows the newly opened file, not the previous one, when another path is clicked', async () => {
    request.mockResolvedValue({ ok: true, kind: 'image', mimeType: 'image/png', size: 3, offset: 0, base64: b64('abc') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/one.png'));
    await screen.findByAltText('one.png');
    act(() => filePreviewPaneStore.open('/p/two.png'));
    await screen.findByAltText('two.png');
    expect(screen.queryByAltText('one.png')).toBeNull();
  });
});

describe('the page colour', () => {
  it('judges which text reads on a colour, and refuses what is not one', () => {
    expect(isLightColor('rgb(255, 255, 255)')).toBe(true);
    expect(isLightColor('rgb(26, 26, 26)')).toBe(false);
    expect(isLightColor('rgba(10, 20, 30, 0.5)')).toBe(false);
    expect(isLightColor('red')).toBeUndefined();
  });

  it('hands the page a probe that only reports, and keeps the page text whole', () => {
    const framed = withBackgroundProbe('<h1>hi</h1>');
    expect(framed.startsWith('<h1>hi</h1>')).toBe(true);
    expect(framed).toContain(PAGE_BACKGROUND_MESSAGE);
  });

  // The bar and the page are one surface: the card takes the colour the page reports about itself.
  it('paints the card in the colour the page reports', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    const frame = await screen.findByTitle('page.html');
    const aside = screen.getByRole('complementary');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { source: (frame as HTMLIFrameElement).contentWindow, data: { type: PAGE_BACKGROUND_MESSAGE, color: 'rgb(26, 26, 26)' } }));
    });
    expect(aside.style.backgroundColor).toBe('rgb(26, 26, 26)');

    // A message from anything but the page's own frame is not believed.
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: PAGE_BACKGROUND_MESSAGE, color: 'rgb(255, 0, 0)' } }));
    });
    expect(aside.style.backgroundColor).toBe('rgb(26, 26, 26)');
  });
});

describe('the resize handle', () => {
  afterEach(() => vi.restoreAllMocks());

  const wide = () => {
    window.matchMedia = ((query: string) => ({
      matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  beforeEach(() => {
    filePreviewPaneStore.setWidth(null);
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    // jsdom has no pointer capture: let the handle behave as if it held it.
    HTMLElement.prototype.setPointerCapture = vi.fn();
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => true);
  });

  it('sets the pane to where the handle is dragged, within bounds, and a double click restores the default', async () => {
    wide();
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    await screen.findByTitle('page.html');
    const handle = screen.getByRole('separator');

    // The pane is as wide as the pointer has moved toward the chat from where the drag began: no jump on grab.
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(400);
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 800 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 800 });
    expect(filePreviewPaneStore.getWidth()).toBe(400);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 700 });
    expect(filePreviewPaneStore.getWidth()).toBe(500);
    expect(screen.getByRole('complementary').style.width).toBe('500px');

    // Too far toward the chat stops where the chat keeps its room; too far the other way, at the minimum.
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: -2000 });
    expect(filePreviewPaneStore.getWidth()).toBe(1200 - 360 - 16);
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 2000 });
    expect(filePreviewPaneStore.getWidth()).toBe(320);

    fireEvent.doubleClick(handle);
    expect(filePreviewPaneStore.getWidth()).toBeNull();
  });

  it('is not there when the pane covers the chat', async () => {
    window.matchMedia = ((query: string) => ({
      matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    await screen.findByTitle('page.html');
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });
});

describe('the path line and the source view', () => {
  it('shows where the file is, and opens a page handed over as a file on its source, with the page one click away', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/private/tmp/ccg-demo/demo593/page.html'));

    expect(await screen.findByText('<h1>hi</h1>')).toBeInTheDocument();
    expect(screen.getByText('… / tmp / ccg-demo / demo593 / page.html')).toBeInTheDocument();
    expect(screen.queryByTitle('page.html')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'filePreview.showRendered' }));
    expect(await screen.findByTitle('page.html')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'filePreview.showSource' }));
    expect(screen.getByText('<h1>hi</h1>')).toBeInTheDocument();
  });

  it('draws a page published as an Artifact first, not its source', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    expect(await screen.findByTitle('page.html')).toBeInTheDocument();
  });

  it('offers an SVG\'s markup too, and nothing for a picture that has none', async () => {
    request.mockResolvedValue({ ok: true, kind: 'image', mimeType: 'image/svg+xml', size: 5, offset: 0, base64: b64('<svg/>') });
    const { unmount } = render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/a.svg'));
    await screen.findByRole('img');
    fireEvent.click(screen.getByRole('button', { name: 'filePreview.showSource' }));
    expect(screen.getByText('<svg/>')).toBeInTheDocument();
    unmount();

    request.mockResolvedValue({ ok: true, kind: 'image', mimeType: 'image/png', size: 3, offset: 0, base64: b64('abc') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/a.png'));
    await screen.findByRole('img');
    expect(screen.queryByRole('button', { name: 'filePreview.showSource' })).not.toBeInTheDocument();
  });
});

describe('the name and the menu header', () => {
  it('calls a page with no title by its file without the extension, as its card does', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/notitle.html', 'https://claude.ai/artifact/x'));
    await screen.findByTitle('notitle.html');
    expect(screen.getByRole('button', { name: 'notitle' })).toBeInTheDocument();
  });

  it('says in the menu how long ago the file was written', async () => {
    request.mockResolvedValue({ ok: true, kind: 'html', mimeType: 'text/html', size: 9, offset: 0, modifiedAt: Date.now() - 3 * 3600 * 1000, base64: b64('<h1>hi</h1>') });
    render(<FilePreviewPane />);
    act(() => filePreviewPaneStore.open('/p/page.html', 'https://claude.ai/artifact/x'));
    await screen.findByTitle('page.html');
    openMenu();
    expect(screen.getByText(/filePreview\.modified/)).toHaveTextContent('3 hours ago');
  });
});
