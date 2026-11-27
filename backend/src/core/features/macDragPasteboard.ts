import { execFile } from 'child_process';
import { stat } from 'fs/promises';
import { basename, win32 } from 'path';
import type { NativeDropEntry } from '../types';

/*
 * A file dropped on the chat in a macOS IDE can reach us as a bare name: the browser inside
 * the IDE hands the plugin the name of each dragged file and not where it is (measured on
 * IDEA 2024.2). The system still knows. Every drag on macOS puts the dragged files on a
 * pasteboard of its own, which any process may read, so the full path is looked up there.
 */

const READ_TIMEOUT_MS = 10_000;

/** One file or folder on the drag pasteboard. [name] is what the Finder calls it. */
export interface DraggedFile {
  path: string;
  name: string;
}

const SCRIPT = `
ObjC.import('AppKit');
function run(argv) {
  var board = $.NSPasteboard.pasteboardWithName(argv.length ? $(argv[0]) : $.NSPasteboardNameDrag);
  var paths = [];
  function add(path) { if (path && paths.indexOf(path) < 0) paths.push(path); }
  var items = board.pasteboardItems;
  var count = items.isNil() ? 0 : items.count;
  for (var i = 0; i < count; i++) {
    var raw = items.objectAtIndex(i).stringForType('public.file-url');
    if (raw.isNil()) continue;
    var url = $.NSURL.URLWithString(raw).filePathURL;
    if (!url.isNil()) add(ObjC.unwrap(url.path));
  }
  // Some programs list every dragged file in one older entry instead of one item each.
  var listed = board.propertyListForType('NSFilenamesPboardType');
  if (!listed.isNil()) ObjC.deepUnwrap(listed).forEach(add);
  var files = $.NSFileManager.defaultManager;
  return JSON.stringify(paths.map(function (path) {
    return { path: path, name: ObjC.unwrap(files.displayNameAtPath(path)) };
  }));
}
`;

/**
 * The files on a macOS pasteboard: the one the current or last drag used, unless [pasteboard]
 * names another one.
 */
export function readMacDragPasteboard(pasteboard?: string): Promise<DraggedFile[]> {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', SCRIPT, ...(pasteboard ? [pasteboard] : [])],
      { timeout: READ_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(stdout) as DraggedFile[]);
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

/** True for a path that says where the file is, in either the POSIX or the Windows form. */
const isFullPath = (path: string): boolean => win32.isAbsolute(path);

// The same name can be written composed or decomposed (Korean, accented letters).
const sameName = (a: string, b: string): boolean => a.normalize('NFC') === b.normalize('NFC');

const isDirectory = async (path: string): Promise<boolean> =>
  stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  );

export interface ResolveDroppedPathsOptions {
  platform?: NodeJS.Platform;
  read?: () => Promise<DraggedFile[]>;
  isFolder?: (path: string) => Promise<boolean>;
}

/**
 * Gives every dropped entry a full path. An entry that has one is returned untouched. A bare
 * name is looked up among the dragged files, and left out when it is not found: no chip, and
 * the chat says the drop could not be read, is better than a chip pointing at a file that
 * does not exist.
 */
export async function resolveDroppedPaths(
  entries: NativeDropEntry[],
  { platform = process.platform, read = readMacDragPasteboard, isFolder = isDirectory }: ResolveDroppedPathsOptions = {},
): Promise<NativeDropEntry[]> {
  if (entries.every((entry) => isFullPath(entry.path))) return entries;

  let dragged: DraggedFile[] = [];
  if (platform === 'darwin') {
    try {
      dragged = await read();
    } catch (error) {
      console.error('[node-backend]', 'Could not read the dragged files from the system:', error);
    }
  }

  const resolved: NativeDropEntry[] = [];
  let missing = 0;
  for (const entry of entries) {
    if (isFullPath(entry.path)) {
      resolved.push(entry);
      continue;
    }
    const at = dragged.findIndex(
      (file) => sameName(basename(file.path), entry.path) || sameName(file.name, entry.path),
    );
    if (at < 0) {
      missing += 1;
      continue;
    }
    // Taken out, so a second file of the same name gets the next one.
    const [file] = dragged.splice(at, 1);
    resolved.push({ path: file.path, type: (await isFolder(file.path)) ? 'folder' : 'file' });
  }
  if (missing > 0) {
    console.error('[node-backend]', `[NATIVE_DROP] no full path found for ${missing} dropped file(s)`);
  }
  return resolved;
}
