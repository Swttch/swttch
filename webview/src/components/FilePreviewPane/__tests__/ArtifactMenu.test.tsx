import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ArtifactMenu } from '../ArtifactMenu';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

const h = vi.hoisted(() => ({
  caps: vi.fn(),
  run: vi.fn(),
  record: vi.fn(),
  refresh: vi.fn(),
  artifacts: vi.fn(),
  openUrl: vi.fn(() => Promise.resolve()),
  success: vi.fn(),
  error: vi.fn(),
  toast: vi.fn(),
  writeText: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openUrl: h.openUrl }),
}));
vi.mock('react-hot-toast', () => ({ default: Object.assign((m: string) => h.toast(m), { success: h.success, error: h.error }) }));
vi.mock('@/i18n', () => ({
  i18n: { t: (key: string) => key },
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    i18n: { language: 'en' },
  }),
}));
vi.mock('@/hooks/useExtApi', () => ({
  useExtCapabilities: () => h.caps(),
  useRunExtApi: () => h.run,
}));
vi.mock('@/hooks/useArtifactRecord', () => ({ useArtifactRecord: () => h.record() }));
vi.mock('@/hooks/useSessionArtifact', () => ({ useSessionArtifactList: () => h.artifacts() }));
vi.mock('@/pages/ChatPage/message-renderers/ToolRenderers/pageTitle', () => ({ usePageTitle: () => undefined }));
vi.mock('@/pages/ChatPage/message-renderers/ToolRenderers/sendUserFile', () => ({ downloadSentFile: vi.fn(() => Promise.resolve(true)) }));

const URL_A = 'https://claude.ai/artifact/aaa';
const ALL = ['api.frame.list', 'api.frame.retitle', 'api.frame.pin', 'api.frame.unpin', 'api.frame.duplicate', 'api.frame.delete'];
const RECORD = { slug: 'uuid-1', title: 'Server Name', rel: 'mine', renamable: true, starred: false };

function draw(source: string | undefined = '<h1>Hi</h1>') {
  return render(<ArtifactMenu heading="page" path="/p/page.html" name="page.html" source={source} publishedUrl={URL_A} onReload={vi.fn()} />);
}
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: /./, expanded: false }));
const item = (name: string) => screen.getByRole('menuitem', { name });

beforeEach(() => {
  Object.values(h).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset());
  h.openUrl.mockImplementation(() => Promise.resolve());
  h.writeText.mockImplementation(() => Promise.resolve());
  h.caps.mockReturnValue({ installed: true, capabilities: ALL, version: '0.8.0' });
  h.run.mockResolvedValue({ ok: true, data: null });
  h.refresh.mockResolvedValue(undefined);
  h.record.mockReturnValue({ record: RECORD, gap: undefined, refresh: h.refresh });
  h.artifacts.mockReturnValue([
    { url: URL_A, title: 'one', filePath: '/p/page.html', timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
    { url: 'https://claude.ai/artifact/bbb', title: 'two', filePath: '/p/two.html', timestamp: null },
  ]);
  Object.assign(navigator, { clipboard: { writeText: h.writeText } });
  filePreviewPaneStore.close();
});

describe('ArtifactMenu', () => {
  it('names the page by what the account calls it, and lists the rows in Claude Desktop\'s order', () => {
    draw();
    expect(screen.getByRole('button', { name: 'Server Name' })).toBeInTheDocument();
    openMenu();
    const rows = screen.getAllByRole('menuitem').map((row) => row.textContent);
    expect(rows).toEqual([
      'artifactMenu.switch2', 'filePreview.download', 'artifactMenu.copyMarkdown', 'artifactMenu.rename', 'artifactMenu.duplicate',
      'artifactMenu.share', 'artifactMenu.openOnWeb', 'filePreview.reload', 'artifactMenu.pin', 'artifactMenu.report', 'artifactMenu.delete',
    ]);
  });

  it('shows who made it and how long ago it was updated', () => {
    draw();
    openMenu();
    expect(screen.getByText('artifactMenu.madeByMe')).toBeInTheDocument();
    expect(screen.getByText(/artifactMenu\.updated/)).toHaveTextContent('3 hours ago');
  });

  it('lists the session\'s artifacts under "switch", marks the current one, and opens another beside the chat', async () => {
    draw();
    openMenu();
    // Hovering the row opens the list beside it.
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: /artifactMenu\.switch/ }).parentElement as HTMLElement);
    const radios = await screen.findAllByRole('menuitemradio');
    expect(radios.map((r) => [r.textContent, r.getAttribute('aria-checked')])).toEqual([['one', 'true'], ['two', 'false']]);
    fireEvent.click(radios[1]);
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/two.html', publishedUrl: 'https://claude.ai/artifact/bbb' });
  });

  it('copies the page as Markdown', async () => {
    draw('<h1>Hi</h1><p>there</p>');
    openMenu();
    fireEvent.click(item('artifactMenu.copyMarkdown'));
    await waitFor(() => expect(h.writeText).toHaveBeenCalledWith('# Hi\n\nthere\n'));
  });

  it('opens the page on the web', () => {
    draw();
    openMenu();
    fireEvent.click(item('artifactMenu.openOnWeb'));
    expect(h.openUrl).toHaveBeenCalledWith(URL_A);
  });

  describe('the rows that need the kit', () => {
    it('are dimmed and do nothing when the kit is not installed', () => {
      h.caps.mockReturnValue({ installed: false, capabilities: [], version: null });
      h.record.mockReturnValue({ record: undefined, gap: 'kitMissing', refresh: h.refresh });
      draw();
      openMenu();
      for (const name of ['artifactMenu.rename', 'artifactMenu.pin', 'artifactMenu.delete']) {
        expect(item(name)).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(item(name));
      }
      expect(h.run).not.toHaveBeenCalled();
    });

    it('are dimmed for a kit that has not got that call yet', () => {
      h.caps.mockReturnValue({ installed: true, capabilities: ['api.frame.list'], version: '0.8.0' });
      draw();
      openMenu();
      expect(item('artifactMenu.pin')).toHaveAttribute('aria-disabled', 'true');
      expect(item('artifactMenu.rename')).toHaveAttribute('aria-disabled', 'true');
    });

    it('stay dimmed for a page the account does not own', () => {
      h.record.mockReturnValue({ record: { ...RECORD, rel: 'shared' }, gap: undefined, refresh: h.refresh });
      draw();
      openMenu();
      expect(item('artifactMenu.rename')).toHaveAttribute('aria-disabled', 'true');
      expect(item('artifactMenu.delete')).toHaveAttribute('aria-disabled', 'true');
    });

    it('share and report are always dimmed: no call for them is known', () => {
      draw();
      openMenu();
      for (const name of ['artifactMenu.share', 'artifactMenu.report']) {
        expect(item(name)).toHaveAttribute('aria-disabled', 'true');
      }
    });
  });

  describe('duplicate', () => {
    it('makes a copy and says so', async () => {
      draw();
      openMenu();
      fireEvent.click(item('artifactMenu.duplicate'));
      await waitFor(() => expect(h.run).toHaveBeenCalledWith('frame', 'duplicate', { slug: 'uuid-1' }, false));
      await waitFor(() => expect(h.success).toHaveBeenCalledWith('artifactMenu.duplicated:{"name":"Server Name (Copy)"}'));
    });

    it('is open to a page the account does not own, unless the server says it cannot be copied', () => {
      h.record.mockReturnValue({ record: { ...RECORD, rel: 'shared', duplicable: true }, gap: undefined, refresh: h.refresh });
      draw();
      openMenu();
      expect(item('artifactMenu.duplicate')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('is dimmed for a page the server says cannot be copied, and for a kit that lacks the call', () => {
      h.record.mockReturnValue({ record: { ...RECORD, duplicable: false }, gap: undefined, refresh: h.refresh });
      draw();
      openMenu();
      expect(item('artifactMenu.duplicate')).toHaveAttribute('aria-disabled', 'true');
    });
  });

  it('pins, and offers to unpin a pinned page', async () => {
    draw();
    openMenu();
    fireEvent.click(item('artifactMenu.pin'));
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('frame', 'pin', { slug: 'uuid-1' }, false));
    expect(h.refresh).toHaveBeenCalled();
  });

  it('says "unpin" for a pinned page and unpins it', async () => {
    h.record.mockReturnValue({ record: { ...RECORD, starred: true }, gap: undefined, refresh: h.refresh });
    draw();
    openMenu();
    fireEvent.click(item('artifactMenu.unpin'));
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('frame', 'unpin', { slug: 'uuid-1' }, false));
  });

  it('renames in place on a double click: Enter saves, Escape leaves it', async () => {
    draw();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Server Name' }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'New name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('frame', 'retitle', { slug: 'uuid-1', title: 'New name' }, false));

    h.run.mockClear();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Server Name' }));
    const again = screen.getByRole('textbox');
    fireEvent.change(again, { target: { value: 'Other' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(h.run).not.toHaveBeenCalled();
  });

  it('does not rename a page to the name it has, or to nothing', async () => {
    draw();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Server Name' }));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
    expect(h.run).not.toHaveBeenCalled();
  });

  it('says why when a double click cannot rename', () => {
    h.caps.mockReturnValue({ installed: false, capabilities: [], version: null });
    h.record.mockReturnValue({ record: undefined, gap: 'kitMissing', refresh: h.refresh });
    draw();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'page' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(h.toast).toHaveBeenCalledWith('artifactMenu.kitMissing');
  });

  it('asks before deleting, and only then deletes with the confirmation', async () => {
    draw();
    openMenu();
    fireEvent.click(item('artifactMenu.delete'));
    expect(h.run).not.toHaveBeenCalled();
    // The dialog names the page and has the delete button.
    fireEvent.click(await screen.findByRole('button', { name: 'artifactMenu.delete' }));
    await waitFor(() => expect(h.run).toHaveBeenCalledWith('frame', 'delete', { slug: 'uuid-1' }, true));
  });

  it('shows the kit\'s reason when a call fails, and changes nothing', async () => {
    h.run.mockResolvedValue({ ok: false, error: { code: 'not_found', message: 'Artifact not found.' } });
    draw();
    openMenu();
    fireEvent.click(item('artifactMenu.pin'));
    await waitFor(() => expect(h.error).toHaveBeenCalledWith('Artifact not found.'));
    expect(h.refresh).not.toHaveBeenCalled();
  });
});
