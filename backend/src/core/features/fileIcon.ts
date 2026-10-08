import { execFile } from 'child_process';

/**
 * The icon the operating system draws for a file type: the app icon a `.kts`
 * opens with, the page with the browser's mark that a PDF gets. It is the same
 * picture the Finder shows, so a chip reads like the file does everywhere else on
 * the machine.
 *
 * Only macOS can be asked cheaply (`NSWorkspace`). Elsewhere the answer is `null`
 * and the chip keeps the icon it draws itself, so an icon from the system is a
 * bonus and never a reason for a chip to look wrong.
 */
export interface FileIcon {
  mimeType: 'image/png';
  base64: string;
}

/** Edge of the picture asked for. A chip draws it at 14 to 28 pixels, on screens up to 2x. */
const ICON_EDGE = 64;
const ICON_TIMEOUT_MS = 10_000;

/** What reaches the shell as an argument, so only the characters an extension can hold. */
const EXTENSION_PATTERN = /^[a-z0-9][a-z0-9_+-]{0,15}$/;

const SCRIPT = `
ObjC.import('AppKit');
function run(argv) {
  var source = $.NSWorkspace.sharedWorkspace.iconForFileType($(argv[0]));
  var edge = ${ICON_EDGE};
  var target = $.NSImage.alloc.initWithSize($.NSMakeSize(edge, edge));
  target.lockFocus;
  source.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, edge, edge), $.NSZeroRect, $.NSCompositingOperationSourceOver, 1.0);
  target.unlockFocus;
  var rep = $.NSBitmapImageRep.imageRepWithData(target.TIFFRepresentation);
  var png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $());
  return ObjC.unwrap(png.base64EncodedStringWithOptions(0));
}
`;

/** Runs the script for one extension and gives back its base64 PNG, or throws. */
export type IconRunner = (extension: string) => Promise<string>;

const runWithOsascript: IconRunner = (extension) =>
  new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', '-e', SCRIPT, extension],
      { timeout: ICON_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
  });

/** Icons already fetched, by extension: the system is asked once per type, not once per file. */
const cache = new Map<string, Promise<FileIcon | null>>();

export async function readFileIcon(
  extension: string,
  options: { platform?: NodeJS.Platform; run?: IconRunner } = {},
): Promise<FileIcon | null> {
  const { platform = process.platform, run = runWithOsascript } = options;
  if (platform !== 'darwin') return null;

  const key = extension.toLowerCase();
  if (!EXTENSION_PATTERN.test(key)) return null;

  const known = cache.get(key);
  if (known) return known;

  const pending = run(key)
    .then((base64): FileIcon | null => (base64 ? { mimeType: 'image/png', base64 } : null))
    .catch((): FileIcon | null => {
      // A script that timed out or failed says nothing lasting about the type, so
      // it is asked again next time rather than remembered as "no icon".
      cache.delete(key);
      return null;
    });
  cache.set(key, pending);
  return pending;
}

/** @internal test-only: forget every fetched icon. */
export function _resetFileIconCache(): void {
  cache.clear();
}
