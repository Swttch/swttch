import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FileKind } from '../fileType';
import { FileTypeIcon, FolderIcon, KIND_COLOR } from '../FileTypeIcon';

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
