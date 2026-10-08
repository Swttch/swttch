import { execFile } from 'child_process';
import type { FileIcon } from './fileIcon';

/** Edge of the picture asked for. A chip draws it at 14 to 28 pixels, on screens up to 2x. */
const ICON_EDGE = 64;
const ICON_TIMEOUT_MS = 10_000;

/** NSWorkspace draws the icon the Finder shows for the type; the script hands it back as base64 png. */
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

/** Runs the script for one extension and gives back its base64 png, or throws. */
export type MacRunner = (extension: string) => Promise<string>;

const runWithOsascript: MacRunner = (extension) =>
  new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', '-e', SCRIPT, extension],
      { timeout: ICON_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout.trim())),
    );
  });

export async function readMacIcon(extension: string, run: MacRunner = runWithOsascript): Promise<FileIcon | null> {
  const base64 = await run(extension);
  return base64 ? { mimeType: 'image/png', base64 } : null;
}
