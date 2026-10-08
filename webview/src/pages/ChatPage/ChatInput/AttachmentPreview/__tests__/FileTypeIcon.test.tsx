import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { MessageType } from '@/shared';

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock('@/api/bridge/Bridge', () => ({ getBridge: () => ({ request: requestMock }) }));

import { FileKind } from '../fileType';
import { FileTypeIcon, FolderIcon, KIND_COLOR } from '../FileTypeIcon';
import { _resetFileIconCache } from '../useFileIcon';

beforeEach(() => {
  cleanup();
  requestMock.mockReset();
  // Where the system cannot be asked, the answer carries no picture.
  requestMock.mockResolvedValue({});
  _resetFileIconCache();
});

const iconOf = (name: string) => render(<FileTypeIcon name={name} />).container.querySelector('svg')!;

describe('FileTypeIcon', () => {
  it.each([
    ['clip.mov', FileKind.Video],
    ['song.mp3', FileKind.Audio],
    ['App.tsx', FileKind.Code],
    ['data.xlsx', FileKind.Spreadsheet],
    ['bundle.zip', FileKind.Archive],
    ['report.pdf', FileKind.Pdf],
    ['logo.svg', FileKind.Image],
    ['Makefile', FileKind.Other],
  ])('draws %s as the %s icon', (name, kind) => {
    expect(iconOf(name).getAttribute('data-kind')).toBe(kind);
  });

  it('puts a symbol on the page for every kind that has one, so two kinds never look alike', () => {
    const drawn = (name: string) => iconOf(name).querySelector('path[d^="M"][stroke-width="1.5"], path:nth-of-type(2)')?.getAttribute('d');
    const symbols = ['clip.mov', 'song.mp3', 'App.tsx', 'data.xlsx', 'bundle.zip', 'logo.svg', 'deck.pptx'].map(drawn);

    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it('draws a file of no known kind as the bare page', () => {
    expect(iconOf('Makefile').querySelectorAll('path')).toHaveLength(1);
  });

  it('takes the color of its kind, so the row reads at a glance', () => {
    expect(iconOf('report.pdf')).toHaveClass(KIND_COLOR[FileKind.Pdf]);
    expect(iconOf('clip.mov')).toHaveClass(KIND_COLOR[FileKind.Video]);
    expect(KIND_COLOR[FileKind.Pdf]).not.toBe(KIND_COLOR[FileKind.Video]);
  });

  it('leaves the color to the caller when asked to', () => {
    const { container } = render(<FileTypeIcon name="report.pdf" colored={false} className="w-7" />);
    expect(container.querySelector('svg')).not.toHaveClass(KIND_COLOR[FileKind.Pdf]);
  });

  it('draws a folder with its own icon', () => {
    expect(render(<FolderIcon />).container.querySelector('svg')?.getAttribute('data-kind')).toBe('folder');
  });
});

describe('FileTypeIcon with the system icon', () => {
  const answerWithPicture = () => requestMock.mockResolvedValue({ mimeType: 'image/png', base64: 'AAA' });

  it('swaps the drawn icon for the one the system has once it arrives', async () => {
    answerWithPicture();
    const { container } = render(<FileTypeIcon name="build.gradle.kts" className="w-7 h-7" />);

    // the drawn icon stands in until the answer comes
    expect(container.querySelector('svg')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());

    const picture = container.querySelector('img')!;
    expect(picture.getAttribute('src')).toBe('data:image/png;base64,AAA');
    expect(picture).toHaveClass('w-7', 'h-7');
    expect(container.querySelector('svg')).toBeNull();
  });

  it('asks the system by extension', async () => {
    render(<FileTypeIcon name="build.gradle.kts" />);
    await waitFor(() => expect(requestMock).toHaveBeenCalledWith(MessageType.GET_FILE_ICON, { extension: 'kts' }));
  });

  it('keeps the drawn icon where the system has none to give', async () => {
    const { container } = render(<FileTypeIcon name="clip.mov" />);

    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    expect(container.querySelector('svg')?.getAttribute('data-kind')).toBe('video');
    expect(container.querySelector('img')).toBeNull();
  });

  it('keeps the drawn icon when the question itself fails', async () => {
    requestMock.mockRejectedValue(new Error('Bridge disconnected'));
    const { container } = render(<FileTypeIcon name="clip.mov" />);

    await waitFor(() => expect(requestMock).toHaveBeenCalled());
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('asks once for an extension however many chips carry it', async () => {
    answerWithPicture();
    render(
      <>
        <FileTypeIcon name="a.pdf" />
        <FileTypeIcon name="b.PDF" />
        <FileTypeIcon name="c.pdf" />
      </>,
    );
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(3));
    expect(requestMock.mock.calls.filter(([type]) => type === MessageType.GET_FILE_ICON)).toHaveLength(1);
  });

  it('does not ask about a name with no extension', () => {
    render(<FileTypeIcon name="gradlew" />);
    expect(requestMock).not.toHaveBeenCalled();
  });
});
