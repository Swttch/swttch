import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { StreamingMessage } from '../StreamingMessage';

const mockOpenFile = vi.fn((_path: string, _line?: number, _column?: number) => Promise.resolve());

// Override only getAdapter().openFile; keep the rest of the module so ToolWrapper
// and other consumers still work.
vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openFile: mockOpenFile }),
}));

// Provide a working directory so relative links resolve; keep the rest of the module.
vi.mock('@/contexts/WorkingDirContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/WorkingDirContext')>()),
  useWorkingDirOrNull: () => ({ workingDirectory: '/wd', setWorkingDirectory: () => {}, ideRoot: null }),
}));

describe('StreamingMessage — local file links open in the IDE', () => {
  beforeEach(() => mockOpenFile.mockClear());

  it('opens an absolute local link at its line', () => {
    render(<StreamingMessage content="See [foo.ts:12](/abs/foo.ts#L12)." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'foo.ts:12' }));
    expect(mockOpenFile).toHaveBeenCalledTimes(1);
    expect(mockOpenFile).toHaveBeenCalledWith('/abs/foo.ts', 12, undefined);
  });

  it('resolves a relative link against the working directory', () => {
    render(<StreamingMessage content="See [x](./src/foo.ts#L3)." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'x' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/wd/src/foo.ts', 3, undefined);
  });

  it('opens a link with no #L at the top (no line argument)', () => {
    render(<StreamingMessage content="See [x](/abs/foo.ts)." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'x' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/abs/foo.ts', undefined, undefined);
  });

  it('opens a Windows drive-absolute link (survives sanitize/harden)', () => {
    // The link must round-trip through rehype-sanitize (which would strip a bare
    // `C:` scheme) — the preprocessor carries it as `/C:/…`.
    const { container } = render(
      <StreamingMessage content="See [foo.ts](C:/proj/foo.ts#L7)." isStreaming={false} />,
    );
    // Not blocked (no greyed-out placeholder), and clickable.
    expect(container.textContent).not.toMatch(/\[blocked\]/i);
    fireEvent.click(screen.getByRole('button', { name: 'foo.ts' }));
    const [path, line] = mockOpenFile.mock.calls[0];
    // harden may lowercase the drive letter; the filesystem is case-insensitive.
    expect(path.toLowerCase()).toBe('c:/proj/foo.ts');
    expect(line).toBe(7);
  });

  it('opens a file:// link instead of rendering it as "[blocked]"', () => {
    // Streamdown's own rehype-sanitize/harden would strip the href and swap the
    // link for a greyed-out "[blocked]" span, and a browser refuses to follow a
    // file: anchor anyway — so it has to travel as a plain path.
    const { container } = render(
      <StreamingMessage content="See [shot](file:///Users/me/pic.png)." isStreaming={false} />,
    );
    expect(container.textContent).not.toMatch(/\[blocked\]/i);
    fireEvent.click(screen.getByRole('button', { name: 'shot' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/Users/me/pic.png', undefined, undefined);
  });

  it('decodes percent-escapes in a file:// path and honors #L', () => {
    render(<StreamingMessage content="See [x](file:///abs/my%20file.ts#L9)." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'x' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/abs/my file.ts', 9, undefined);
  });

  it('opens a Windows file:///C:/… link', () => {
    render(<StreamingMessage content="See [w](file:///C:/proj/foo.ts#L3)." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'w' }));
    const [path, line] = mockOpenFile.mock.calls[0];
    expect(path.toLowerCase()).toBe('c:/proj/foo.ts');
    expect(line).toBe(3);
  });

  it('treats file://localhost/… as this machine', () => {
    render(<StreamingMessage content="See [l](file://localhost/abs/foo.ts)." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'l' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/abs/foo.ts', undefined, undefined);
  });

  it('does NOT treat a remote file://host/share UNC path as local', () => {
    render(<StreamingMessage content="See [unc](file://server/share/x.txt)." isStreaming={false} />);
    expect(screen.queryByRole('button', { name: 'unc' })).toBeNull();
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it('does not rewrite link URLs inside inline code', () => {
    const { container } = render(
      <StreamingMessage content={'Use `[a](./foo.ts)` here.'} isStreaming={false} />,
    );
    const code = container.querySelector('[data-streamdown="inline-code"]');
    expect(code?.textContent).toBe('[a](./foo.ts)'); // verbatim, no /wd/ injected
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it('renders an in-page # anchor as a same-tab link', () => {
    render(<StreamingMessage content="See [Sec](#section)." isStreaming={false} />);
    const anchor = screen.getByRole('link', { name: 'Sec' });
    expect(anchor.getAttribute('href')).toBe('#section');
    expect(anchor.getAttribute('target')).toBeNull();
  });

  it('renders an external link as a normal web link and never calls openFile', () => {
    render(<StreamingMessage content="See [site](https://example.com)." isStreaming={false} />);
    const anchor = screen.getByRole('link', { name: 'site' }) as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toMatch(/^https:\/\/example\.com/);
    expect(anchor.getAttribute('target')).toBe('_blank');
    fireEvent.click(anchor);
    expect(mockOpenFile).not.toHaveBeenCalled();
  });
});

describe('StreamingMessage — bare plain-text file references', () => {
  beforeEach(() => mockOpenFile.mockClear());

  it('linkifies a plain-text path:line and opens it at the line', () => {
    render(<StreamingMessage content="Found it in src/app.ts:42 today." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'src/app.ts:42' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/wd/src/app.ts', 42, undefined);
  });

  it('carries the column from a plain-text path:line:col', () => {
    render(<StreamingMessage content="See src/app.ts:42:7 here." isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'src/app.ts:42:7' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/wd/src/app.ts', 42, 7);
  });

  it('linkifies a plain-text #L range and anchors the start line', () => {
    render(<StreamingMessage content="around src/example/File.java#L10-L25 look" isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'src/example/File.java#L10-L25' }));
    expect(mockOpenFile).toHaveBeenCalledWith('/wd/src/example/File.java', 10, undefined);
  });

  it('does NOT linkify a bare filename with no slash', () => {
    render(<StreamingMessage content="App.java:120 threw." isStreaming={false} />);
    expect(screen.queryByRole('button', { name: /App\.java/ })).toBeNull();
    expect(mockOpenFile).not.toHaveBeenCalled();
  });

  it('does NOT linkify a path:line inside inline code', () => {
    const { container } = render(
      <StreamingMessage content={'Use `src/app.ts:42` verbatim.'} isStreaming={false} />,
    );
    const code = container.querySelector('[data-streamdown="inline-code"]');
    expect(code?.textContent).toBe('src/app.ts:42');
    expect(mockOpenFile).not.toHaveBeenCalled();
  });
});
