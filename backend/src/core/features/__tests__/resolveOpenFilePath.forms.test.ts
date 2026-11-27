import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { pathToFileURL } from 'url';
import { resolveOpenFilePath } from '../resolveOpenFilePath';

/** The forms a clicked file reference takes, against real files on this machine (#708). */
describe('resolveOpenFilePath — every form of a clicked reference, on disk', () => {
  let root: string;
  let home: string;

  const put = (relative: string, content = 'x') => {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    return path;
  };
  const open = (requested: string, workingDir: string | undefined = root) =>
    resolveOpenFilePath(requested, { workingDir, home });

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'ccg-links-'));
    home = join(root, 'home');
    put('docs/versions/0.1.3/README.md', '# 版本\n\n## 1. 概述\n\ntext\n\n## 3. 数据中心专题索引\n');
    put('src/app.ts', 'a\nb\nc\n');
    put('Makefile');
    put('C#/Program.cs');
    put('notes#1.md');
    put('page.html');
    put('home/notes/a.md');
    put('docs/my file.md');
    put('app/(group)/[id]/page.tsx');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('opens a document linked with a heading, at that heading (the reported link)', () => {
    const file = join(root, 'docs/versions/0.1.3/README.md');
    expect(open(`${file}#3-数据中心专题索引`)).toEqual({ path: file, line: 7 });
  });

  it('opens it when the heading is percent-encoded too', () => {
    const file = join(root, 'docs/versions/0.1.3/README.md');
    expect(open(`${file}#${encodeURIComponent('3-数据中心专题索引')}`)).toEqual({ path: file, line: 7 });
  });

  it('opens the file at the top when no heading matches', () => {
    const file = join(root, 'docs/versions/0.1.3/README.md');
    expect(open(`${file}#없는-제목`)).toEqual({ path: file });
  });

  it('drops a fragment or query after a file that is not markdown', () => {
    expect(open(`${join(root, 'page.html')}#section`)).toEqual({ path: join(root, 'page.html') });
    expect(open(`${join(root, 'src/app.ts')}?plain=1`)).toEqual({ path: join(root, 'src/app.ts') });
  });

  it('keeps a # that is part of the name', () => {
    expect(open(join(root, 'notes#1.md'))).toEqual({ path: join(root, 'notes#1.md') });
    expect(open(join(root, 'C#/Program.cs'))).toEqual({ path: join(root, 'C#/Program.cs') });
    expect(open(`${join(root, 'notes#1.md')}#title`)).toEqual({ path: join(root, 'notes#1.md') });
  });

  it.each([
    [':2', { line: 2 }],
    [':2:5', { line: 2, column: 5 }],
    [':2-3', { line: 2 }],
    [':L2', { line: 2 }],
    ['#L2', { line: 2 }],
    ['#L2C4-L3', { line: 2, column: 4 }],
    ['#L2-3', { line: 2 }],
    ['(2)', { line: 2 }],
    ['(2,5)', { line: 2, column: 5 }],
  ])('reads the position written as %s', (suffix, position) => {
    expect(open(`${join(root, 'src/app.ts')}${suffix}`)).toEqual({ path: join(root, 'src/app.ts'), ...position });
  });

  it('reads a position after a name with no extension', () => {
    expect(open(`${join(root, 'Makefile')}:1`)).toEqual({ path: join(root, 'Makefile'), line: 1 });
  });

  it('finds a relative path in the project, not in the backend\'s own folder', () => {
    expect(open('src/app.ts')).toEqual({ path: join(root, 'src/app.ts') });
    expect(open('./docs/../src/app.ts:3')).toEqual({ path: join(root, 'src/app.ts'), line: 3 });
    // package.json exists where the tests run; the project has none.
    expect(open('package.json')).toEqual({ path: 'package.json' });
  });

  it('expands a home path', () => {
    expect(open('~/notes/a.md')).toEqual({ path: join(home, 'notes/a.md') });
  });

  it('reads a percent-encoded path and a file URL', () => {
    expect(open(`${root}/docs/my%20file.md`)).toEqual({ path: join(root, 'docs/my file.md') });
    expect(open(`${pathToFileURL(join(root, 'docs/my file.md')).href}`)).toEqual({ path: join(root, 'docs/my file.md') });
  });

  it('opens a path with brackets and parentheses', () => {
    expect(open('app/(group)/[id]/page.tsx')).toEqual({ path: join(root, 'app/(group)/[id]/page.tsx') });
  });

  it('opens a folder as written', () => {
    expect(open(join(root, 'docs'))).toEqual({ path: join(root, 'docs') });
  });

  it('does not cut a missing path down to a folder', () => {
    expect(open(`${join(root, 'docs')}#heading`)).toEqual({ path: `${join(root, 'docs')}#heading` });
    expect(open(join(root, 'nope.ts:3'))).toEqual({ path: join(root, 'nope.ts:3') });
  });
});

describe('resolveOpenFilePath — spellings of another side of the machine', () => {
  const probe = (...present: string[]) => ({
    exists: (path: string) => present.includes(path),
    isFile: (path: string) => present.includes(path),
    readText: () => '',
  });
  const on = (platform: NodeJS.Platform, requested: string, present: string[], workingDir?: string) =>
    resolveOpenFilePath(requested, { platform, workingDir, ...probe(...present) });

  it.each([
    ['/C:/proj/a.ts', 'C:/proj/a.ts'],
    ['/cygdrive/c/proj/a.ts', 'C:/proj/a.ts'],
    ['/mnt/c/proj/a.ts', 'C:/proj/a.ts'],
  ])('on Windows, opens %s', (requested, onDisk) => {
    expect(on('win32', requested, [onDisk])).toEqual({ path: onDisk });
  });

  it('on Windows, opens a Linux path of a WSL project through its UNC root', () => {
    expect(
      on('win32', '/home/me/proj/a.ts', ['//wsl$/Ubuntu/home/me/proj/a.ts'], '\\\\wsl$\\Ubuntu\\home\\me\\proj'),
    ).toEqual({ path: '//wsl$/Ubuntu/home/me/proj/a.ts' });
  });

  it('on Windows, opens a heading link written the Git Bash way', () => {
    expect(on('win32', '/d/proj/README.md#title', ['D:/proj/README.md'])).toEqual({ path: 'D:/proj/README.md' });
  });

  it('under WSL, finds a relative path of a project the IDE names by its UNC path', () => {
    expect(on('linux', 'src/a.ts:4', ['/home/me/proj/src/a.ts'], '//wsl$/Ubuntu/home/me/proj')).toEqual({
      path: '/home/me/proj/src/a.ts',
      line: 4,
    });
  });

  it('on Windows, joins a relative path to the project folder', () => {
    expect(on('win32', 'src/a.ts', ['C:\\proj\\src\\a.ts'], 'C:\\proj')).toEqual({ path: 'C:\\proj\\src\\a.ts' });
  });

  it('opens a name stored decomposed under the composed spelling', () => {
    const composed = '/p/문서.md'.normalize('NFC');
    const decomposed = composed.normalize('NFD');
    expect(on('linux', composed, [decomposed])).toEqual({ path: decomposed });
  });
});
