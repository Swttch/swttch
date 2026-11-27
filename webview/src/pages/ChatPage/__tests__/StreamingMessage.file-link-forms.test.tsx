import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/react';
import { StreamingMessage } from '../StreamingMessage';
import { filePreviewPaneStore } from '@/utils/filePreviewPaneStore';

/**
 * Every shape a file link takes in a reply, taken through the real markdown pipeline
 * (our preprocessing, then Streamdown's sanitize and harden steps) to the click, so
 * what is asserted is what the backend is asked to open (#708).
 *
 * A `#heading` stays on the path: the backend tells a heading from a `#` that is part
 * of a file name by looking at the disk.
 */
const mockOpenFile = vi.fn((_path: string, _line?: number, _column?: number) => Promise.resolve());

vi.mock('@/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/adapters')>()),
  getAdapter: () => ({ openFile: mockOpenFile, openUrl: () => Promise.resolve() }),
}));

let workingDirectory = '/wd';
vi.mock('@/contexts/WorkingDirContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/contexts/WorkingDirContext')>()),
  useWorkingDirOrNull: () => ({ workingDirectory, setWorkingDirectory: () => {}, ideRoot: null }),
}));

interface Case {
  name: string;
  markdown: string;
  /** The clickable text. */
  label: string;
  path: string;
  line?: number;
  column?: number;
  workingDirectory?: string;
}

/** Streamdown may lowercase a drive letter; Windows does not care. */
const upperDrive = (path: string) => path.replace(/^[a-z]:/, (drive) => drive.toUpperCase());

const MARKDOWN_LINKS: Case[] = [
  {
    name: 'a heading in a Windows document, as reported',
    markdown: '[数据中心专题索引](D:/wenge/fabric/docs/versions/0.1.3/README.md#3-数据中心专题索引)',
    label: '数据中心专题索引',
    path: 'D:/wenge/fabric/docs/versions/0.1.3/README.md#3-数据中心专题索引',
  },
  { name: 'a heading in a relative document', markdown: '[h](docs/README.md#설치-방법)', label: 'h', path: '/wd/docs/README.md#설치-방법' },
  { name: 'path:line', markdown: '[a](src/app.ts:42)', label: 'a', path: '/wd/src/app.ts', line: 42 },
  { name: 'path:start-end', markdown: '[a](src/app.ts:10-20)', label: 'a', path: '/wd/src/app.ts', line: 10 },
  { name: '#Lstart-end', markdown: '[a](src/app.ts#L10-20)', label: 'a', path: '/wd/src/app.ts', line: 10 },
  { name: 'parentheses in the path', markdown: '[a](app/(group)/page.tsx)', label: 'a', path: '/wd/app/(group)/page.tsx' },
  { name: 'brackets in the label and path', markdown: '[app/[id]/page.tsx](app/[id]/page.tsx)', label: 'app/[id]/page.tsx', path: '/wd/app/[id]/page.tsx' },
  { name: 'a code span as the label', markdown: '[`src/app.ts`](src/app.ts)', label: 'src/app.ts', path: '/wd/src/app.ts' },
  { name: 'a code span with a line as the label', markdown: '[`src/app.ts:3`](src/app.ts:3)', label: 'src/app.ts:3', path: '/wd/src/app.ts', line: 3 },
  { name: 'angle brackets around a path with spaces', markdown: '[a](<docs/my file.md>)', label: 'a', path: '/wd/docs/my file.md' },
  { name: 'spaces left unencoded', markdown: '[a](docs/my file.md)', label: 'a', path: '/wd/docs/my file.md' },
  { name: 'spaces in an absolute path with a line', markdown: '[a](/Users/me/My Documents/a.md#L3)', label: 'a', path: '/Users/me/My Documents/a.md', line: 3 },
  { name: 'a link title', markdown: '[a](docs/a.md "Title")', label: 'a', path: '/wd/docs/a.md' },
  { name: 'a home folder path', markdown: '[a](~/notes/a.md)', label: 'a', path: '~/notes/a.md' },
  { name: 'a Windows path with backslashes', markdown: '[a](C:\\Users\\me\\.claude\\settings.json)', label: 'a', path: 'C:/Users/me/.claude/settings.json' },
  { name: 'a UNC path', markdown: '[a](\\\\server\\share\\a.txt)', label: 'a', path: '//server/share/a.txt' },
  { name: 'a relative path with backslashes', markdown: '[a](src\\app.ts)', label: 'a', path: '/wd/src/app.ts' },
  { name: 'a dot-relative path with backslashes', markdown: '[a](.\\src\\app.ts)', label: 'a', path: '/wd/src/app.ts' },
  { name: 'a file URL with an encoded drive colon', markdown: '[a](file:///c%3A/proj/a.ts#L3)', label: 'a', path: 'C:/proj/a.ts', line: 3 },
  { name: 'a file URL into WSL', markdown: '[a](file://wsl.localhost/Ubuntu/home/me/a.ts)', label: 'a', path: '//wsl.localhost/Ubuntu/home/me/a.ts' },
  { name: 'a Git Bash drive path', markdown: '[a](/c/Users/me/a.ts)', label: 'a', path: '/c/Users/me/a.ts' },
  { name: 'folders with non-Latin names', markdown: '[a](docs/数据中心/说明.md)', label: 'a', path: '/wd/docs/数据中心/说明.md' },
  { name: 'a percent-encoded name', markdown: '[a](docs/%E6%95%B0.md)', label: 'a', path: '/wd/docs/数.md' },
  { name: 'a # that is part of a folder name', markdown: '[a](./C#/Program.cs)', label: 'a', path: '/wd/C#/Program.cs' },
  { name: 'an editor URL', markdown: '[a](vscode://file/Users/me/a.ts:10:2)', label: 'a', path: '/Users/me/a.ts', line: 10, column: 2 },
  { name: 'a name with no extension', markdown: '[a](Makefile)', label: 'a', path: '/wd/Makefile' },
  { name: 'a reference-style link', markdown: '[a][r]\n\n[r]: src/app.ts', label: 'a', path: '/wd/src/app.ts' },
  { name: 'a parent folder', markdown: '[a](../sibling/a.md)', label: 'a', path: '/wd/sibling/a.md', workingDirectory: '/wd/proj' },
  { name: 'a relative link in a Windows project', markdown: '[a](src/app.ts:7)', label: 'a', path: 'C:/proj/src/app.ts', line: 7, workingDirectory: 'C:\\proj' },
  { name: 'a link inside parentheses', markdown: '(see [a](docs/a.md) and [b](docs/b.md))', label: 'b', path: '/wd/docs/b.md' },
];

const PLAIN_TEXT: Case[] = [
  { name: 'non-Latin folder names', markdown: '참고: docs/数据中心/README.md:10 입니다', label: 'docs/数据中心/README.md:10', path: '/wd/docs/数据中心/README.md', line: 10 },
  { name: 'a non-Latin first folder', markdown: '数据中心/README.md:10', label: '数据中心/README.md:10', path: '/wd/数据中心/README.md', line: 10 },
  { name: 'prose glued to the path', markdown: '请看docs/a.md:3', label: 'docs/a.md:3', path: '/wd/docs/a.md', line: 3 },
  { name: 'a bracketed route folder', markdown: 'src/app/[id]/page.tsx:3', label: 'src/app/[id]/page.tsx:3', path: '/wd/src/app/[id]/page.tsx', line: 3 },
  { name: 'a parenthesised route group', markdown: 'app/(group)/page.tsx:3', label: 'app/(group)/page.tsx:3', path: '/wd/app/(group)/page.tsx', line: 3 },
  { name: 'a home folder path', markdown: '~/proj/a.ts:3', label: '~/proj/a.ts:3', path: '~/proj/a.ts', line: 3 },
  { name: 'a scoped package', markdown: 'node_modules/@types/node/index.d.ts:5', label: 'node_modules/@types/node/index.d.ts:5', path: '/wd/node_modules/@types/node/index.d.ts', line: 5 },
  { name: 'backslash separators', markdown: 'see src\\app.ts:3 now', label: 'src\\app.ts:3', path: '/wd/src/app.ts', line: 3 },
  { name: 'a line range', markdown: 'src/app.ts:10-20', label: 'src/app.ts:10-20', path: '/wd/src/app.ts', line: 10 },
];

describe.each([
  ['markdown links', MARKDOWN_LINKS],
  ['plain-text references', PLAIN_TEXT],
])('every file link form — %s (#708)', (_group, cases) => {
  beforeEach(() => {
    cleanup();
    mockOpenFile.mockClear();
    filePreviewPaneStore.close();
    workingDirectory = '/wd';
  });

  it.each(cases)('opens $name', (testCase) => {
    workingDirectory = testCase.workingDirectory ?? '/wd';
    const { container } = render(<StreamingMessage content={testCase.markdown} isStreaming={false} />);
    expect(container.textContent).not.toMatch(/\[blocked\]/i);
    fireEvent.click(screen.getByRole('button', { name: testCase.label }));
    expect(mockOpenFile).toHaveBeenCalledTimes(1);
    const [path, line, column] = mockOpenFile.mock.calls[0];
    expect({ path: upperDrive(path), line, column }).toEqual({ path: testCase.path, line: testCase.line, column: testCase.column });
  });
});

describe('every file link form — the preview pane (#708)', () => {
  beforeEach(() => {
    cleanup();
    mockOpenFile.mockClear();
    filePreviewPaneStore.close();
    workingDirectory = '/wd';
  });

  it('opens a page linked with a section in the pane, by its file path', () => {
    render(<StreamingMessage content="[a](docs/page.html#section)" isStreaming={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(filePreviewPaneStore.get()).toEqual({ path: '/wd/docs/page.html' });
    expect(mockOpenFile).not.toHaveBeenCalled();
  });
});
