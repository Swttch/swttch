import { describe, it, expect } from 'vitest';
import { FileKind, extensionOf, extensionTag, fileKindOf, isPictureName } from '../fileType';

describe('isPictureName', () => {
  it.each(['a.png', 'a.PNG', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.svg', 'a.bmp', 'a.ico', 'a.avif', 'KakaoTalk_Photo 001.jpeg'])(
    'counts %s as a picture a browser can draw',
    (name) => expect(isPictureName(name)).toBe(true),
  );

  it.each(['a.heic', 'a.tiff', 'a.psd', 'a.pdf', 'png', 'a.png.txt', '.png', 'Makefile'])(
    'does not count %s',
    (name) => expect(isPictureName(name)).toBe(false),
  );
});

describe('fileKindOf', () => {
  it.each([
    ['report.pdf', FileKind.Pdf],
    ['clip.mov', FileKind.Video],
    ['clip.MP4', FileKind.Video],
    ['notes.md', FileKind.Text],
    ['App.tsx', FileKind.Code],
    ['data.csv', FileKind.Spreadsheet],
    ['deck.pptx', FileKind.Presentation],
    ['letter.docx', FileKind.Document],
    ['bundle.tar.gz', FileKind.Archive],
    ['song.flac', FileKind.Audio],
    ['logo.svg', FileKind.Image],
    ['photo.heic', FileKind.Image],
  ])('puts %s with the %s kind', (name, kind) => {
    expect(fileKindOf(name)).toBe(kind);
  });

  it('falls back to the plain kind for an extension nobody listed or none at all', () => {
    expect(fileKindOf('data.weird-extension')).toBe(FileKind.Other);
    expect(fileKindOf('Makefile')).toBe(FileKind.Other);
  });

  it('reads Korean and spaced names by their last extension', () => {
    expect(fileKindOf('화면 기록 2026-01-01 오후 1.02.03.mov')).toBe(FileKind.Video);
  });
});

describe('extensionOf', () => {
  it('is empty for a name with no extension, a dotfile, or a trailing dot', () => {
    expect(extensionOf('Makefile')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('weird.')).toBe('');
  });

  it('takes only the part after the last dot, lower-cased', () => {
    expect(extensionOf('a.b.TXT')).toBe('txt');
  });
});

describe('extensionTag', () => {
  it('is the extension in capitals, cut to what fits on the icon', () => {
    expect(extensionTag('clip.mov')).toBe('MOV');
    expect(extensionTag('page.markdown')).toBe('MARK');
    expect(extensionTag('Makefile')).toBe('');
  });
});
