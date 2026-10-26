import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { StreamingMessage } from '../StreamingMessage';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

const { artifact, pageTitle, openUrl } = vi.hoisted(() => ({
  artifact: vi.fn(),
  pageTitle: vi.fn(),
  openUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openFile: vi.fn(() => Promise.resolve()), openUrl }),
}));
vi.mock('@/hooks/useSessionArtifact', () => ({ useSessionArtifact: (url: string) => artifact(url) }));
vi.mock('../message-renderers/ToolRenderers/pageTitle', () => ({ usePageTitle: (path?: string) => pageTitle(path) }));

const URL_A = 'https://claude.ai/artifact/7grQd2eXjDyXKVp7jXa9Mn';

beforeEach(() => {
  artifact.mockReset();
  pageTitle.mockReset();
  openUrl.mockClear();
  filePreviewPaneStore.close();
});

describe('an Artifact address inside a reply', () => {
  it('is a chip with the page name instead of the address, and opens the page beside the chat', () => {
    artifact.mockReturnValue({ title: 'page', filePath: '/p/page.html', timestamp: null });
    pageTitle.mockReturnValue('Demo Page');
    render(<StreamingMessage content={`Published at ${URL_A} (Version 1).`} isStreaming={false} />);

    expect(screen.queryByText(URL_A)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Demo Page' }));
    expect(filePreviewPaneStore.get()).toEqual({ path: '/p/page.html', publishedUrl: URL_A });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('falls back to the call\'s title, and to "untitled", when the page names nothing', () => {
    artifact.mockReturnValue({ title: 'deck', filePath: '/p/deck.html', timestamp: null });
    pageTitle.mockReturnValue(undefined);
    const { unmount } = render(<StreamingMessage content={URL_A} isStreaming={false} />);
    expect(screen.getByRole('button', { name: 'deck' })).toBeInTheDocument();
    unmount();

    artifact.mockReturnValue(undefined);
    render(<StreamingMessage content={URL_A} isStreaming={false} />);
    expect(screen.getByRole('button', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('opens at its address when the session published it from no file here', () => {
    artifact.mockReturnValue(undefined);
    render(<StreamingMessage content={URL_A} isStreaming={false} />);
    fireEvent.click(screen.getByRole('button'));
    expect(openUrl).toHaveBeenCalledWith(URL_A);
    expect(filePreviewPaneStore.get()).toBeNull();
  });

  it('leaves any other address a plain link', () => {
    render(<StreamingMessage content="See https://example.com/page." isStreaming={false} />);
    expect(screen.getByRole('link', { name: 'https://example.com/page' })).toBeInTheDocument();
  });
});
