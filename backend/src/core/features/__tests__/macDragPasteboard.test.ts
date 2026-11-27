import { describe, it, expect, vi } from 'vitest';
import { execFile } from 'child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { readMacDragPasteboard, resolveDroppedPaths, type DraggedFile } from '../macDragPasteboard';

const reading = (files: DraggedFile[]) => vi.fn().mockResolvedValue(files);
const isFolder = async (path: string) => path.endsWith('folder');

describe('resolveDroppedPaths', () => {
  it('leaves entries that already carry a full path alone and reads nothing', async () => {
    const read = reading([]);
    const entries = [
      { path: '/Users/a/README.txt', type: 'file' as const },
      { path: 'C:\\work\\README.txt', type: 'file' as const },
      { path: '\\\\wsl$\\Ubuntu\\home\\a\\x.ts', type: 'file' as const },
    ];

    expect(await resolveDroppedPaths(entries, { platform: 'darwin', read, isFolder })).toEqual(entries);
    expect(read).not.toHaveBeenCalled();
  });

  it('finds the full path of a bare file name among the files being dragged', async () => {
    const read = reading([{ path: '/Users/a/demo/README.txt', name: 'README.txt' }]);

    expect(
      await resolveDroppedPaths([{ path: 'README.txt', type: 'file' }], { platform: 'darwin', read, isFolder }),
    ).toEqual([{ path: '/Users/a/demo/README.txt', type: 'file' }]);
  });

  it('says folder when the dragged thing is a folder, which the bare name could not tell', async () => {
    const read = reading([{ path: '/Users/a/demo/folder', name: 'folder' }]);

    expect(
      await resolveDroppedPaths([{ path: 'folder', type: 'file' }], { platform: 'darwin', read, isFolder }),
    ).toEqual([{ path: '/Users/a/demo/folder', type: 'folder' }]);
  });

  it('matches the name Finder shows when it differs from the name on disk', async () => {
    const read = reading([{ path: '/Users/a/Downloads', name: '다운로드' }]);

    expect(
      await resolveDroppedPaths([{ path: '다운로드', type: 'file' }], { platform: 'darwin', read, isFolder }),
    ).toEqual([{ path: '/Users/a/Downloads', type: 'file' }]);
  });

  it('matches a Korean name whether it is written composed or decomposed', async () => {
    const read = reading([{ path: `/Users/a/${'한글.txt'.normalize('NFD')}`, name: '한글.txt'.normalize('NFD') }]);

    const resolved = await resolveDroppedPaths([{ path: '한글.txt'.normalize('NFC'), type: 'file' }], {
      platform: 'darwin',
      read,
      isFolder,
    });

    // The path stays exactly as the system wrote it.
    expect(resolved).toEqual([{ path: `/Users/a/${'한글.txt'.normalize('NFD')}`, type: 'file' }]);
  });

  it('gives each of two same-named files its own path', async () => {
    const read = reading([
      { path: '/Users/a/one/index.ts', name: 'index.ts' },
      { path: '/Users/a/two/index.ts', name: 'index.ts' },
    ]);
    const entries = [
      { path: 'index.ts', type: 'file' as const },
      { path: 'index.ts', type: 'file' as const },
    ];

    expect((await resolveDroppedPaths(entries, { platform: 'darwin', read, isFolder })).map((e) => e.path)).toEqual([
      '/Users/a/one/index.ts',
      '/Users/a/two/index.ts',
    ]);
  });

  it('drops a name it cannot find rather than guessing a path for it', async () => {
    const read = reading([{ path: '/Users/a/other.txt', name: 'other.txt' }]);

    expect(
      await resolveDroppedPaths(
        [
          { path: 'README.txt', type: 'file' },
          { path: '/Users/a/known.txt', type: 'file' },
        ],
        { platform: 'darwin', read, isFolder },
      ),
    ).toEqual([{ path: '/Users/a/known.txt', type: 'file' }]);
  });

  it('drops bare names when the drag cannot be read', async () => {
    const read = vi.fn().mockRejectedValue(new Error('timed out'));

    expect(
      await resolveDroppedPaths([{ path: 'README.txt', type: 'file' }], { platform: 'darwin', read, isFolder }),
    ).toEqual([]);
  });

  it('drops bare names outside macOS without reading anything', async () => {
    const read = reading([]);

    expect(
      await resolveDroppedPaths([{ path: 'README.txt', type: 'file' }], { platform: 'linux', read, isFolder }),
    ).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});

/**
 * Against the real system, on a pasteboard of our own so the person's drag pasteboard is
 * left as it is.
 */
describe.skipIf(process.platform !== 'darwin')('readMacDragPasteboard on this machine', () => {
  const run = promisify(execFile);
  const WRITE = `
ObjC.import('AppKit');
function run(argv) {
  var board = $.NSPasteboard.pasteboardWithName($(argv[0]));
  board.clearContents;
  var urls = $.NSMutableArray.alloc.init;
  for (var i = 1; i < argv.length; i++) urls.addObject($.NSURL.fileURLWithPath($(argv[i])));
  board.writeObjects(urls);
}
`;
  const RELEASE = `
ObjC.import('AppKit');
function run(argv) { $.NSPasteboard.pasteboardWithName($(argv[0])).releaseGlobally; }
`;

  it('reads the full path of every file and folder on the pasteboard', async () => {
    const board = `swttch-test-${process.pid}-${Date.now()}`;
    const dir = await mkdtemp(join(tmpdir(), 'swttch-drag-'));
    try {
      const file = join(dir, '끌어놓기 note.txt');
      const folder = join(dir, 'inner folder');
      await writeFile(file, 'x');
      await mkdir(folder);
      await run('osascript', ['-l', 'JavaScript', '-e', WRITE, board, file, folder]);

      const dragged = await readMacDragPasteboard(board);

      expect(dragged.map((d) => d.path.normalize('NFC'))).toEqual(
        [file, folder].map((p) => expect.stringContaining(p.slice(dir.length).normalize('NFC'))),
      );
      expect(
        (await resolveDroppedPaths(
          [
            { path: '끌어놓기 note.txt', type: 'file' },
            { path: 'inner folder', type: 'file' },
          ],
          { platform: 'darwin', read: () => readMacDragPasteboard(board) },
        )).map((e) => e.type),
      ).toEqual(['file', 'folder']);
    } finally {
      await run('osascript', ['-l', 'JavaScript', '-e', RELEASE, board]).catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
