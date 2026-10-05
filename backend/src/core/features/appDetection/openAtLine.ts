import { execFile } from 'child_process';

/**
 * How to open a file at a line in a detected editor. The OS opener can only hand
 * a path over, so an editor that wants the line has to be asked in its own way:
 * a URL its URL scheme understands, or its launcher with line arguments.
 */
export type OpenAtLine =
  | { kind: 'url'; url: string }
  | { kind: 'exec'; command: string; args: string[] };

/** Editors that take `<scheme>://file/<path>:<line>:<column>`. */
const URL_SCHEMES: Record<string, string> = {
  vscode: 'vscode',
  'vscode-insiders': 'vscode-insiders',
  vscodium: 'vscodium',
  cursor: 'cursor',
  windsurf: 'windsurf',
};

/** JetBrains launchers take `--line <n> [--column <n>] <path>`. Fleet has no such launcher. */
const JETBRAINS_IDS = new Set([
  'webstorm', 'intellij', 'intellij-ce', 'pycharm', 'pycharm-ce', 'goland', 'phpstorm',
  'rubymine', 'clion', 'rider', 'rustrover', 'dataspell', 'datagrip', 'aqua', 'android-studio',
]);

/** Whether this editor can be asked for a line at all. */
export function canOpenAtLine(editorId: string): boolean {
  return editorId in URL_SCHEMES || JETBRAINS_IDS.has(editorId) || editorId === 'sublime' || editorId === 'zed';
}

/** `/a b/c.ts` -> `/a%20b/c.ts`; `C:\a\b.ts` -> `/C:/a/b.ts` (a URL path starts with a slash). */
function toUrlPath(filePath: string): string {
  const slashed = filePath.replace(/\\/g, '/');
  const rooted = slashed.startsWith('/') ? slashed : `/${slashed}`;
  return rooted.split('/').map((seg) => encodeURIComponent(seg).replace(/%3A/gi, ':')).join('/');
}

/** macOS: the executable name inside a `.app` bundle, as its Info.plist declares it. */
export function readMacBundleExecutable(appPath: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleExecutable', `${appPath}/Contents/Info.plist`],
      (err, stdout) => resolve(err ? undefined : String(stdout ?? '').trim() || undefined),
    );
  });
}

/**
 * Work out how to open `filePath` at `line` in the editor installed at `appPath`.
 * Returns null when this editor cannot be asked for a line, so the caller opens
 * the file the plain way instead of not opening it.
 */
export async function resolveOpenAtLine(
  editorId: string,
  appPath: string,
  filePath: string,
  line: number,
  column?: number,
  platform: NodeJS.Platform = process.platform,
  readExecutable: (appPath: string) => Promise<string | undefined> = readMacBundleExecutable,
): Promise<OpenAtLine | null> {
  const mac = platform === 'darwin' && appPath.endsWith('.app');
  const at = column ? `${line}:${column}` : `${line}`;

  const scheme = URL_SCHEMES[editorId];
  if (scheme) {
    return { kind: 'url', url: `${scheme}://file${toUrlPath(filePath)}:${at}` };
  }

  if (JETBRAINS_IDS.has(editorId)) {
    let command = appPath;
    if (mac) {
      const exe = await readExecutable(appPath);
      if (!exe) return null;
      command = `${appPath}/Contents/MacOS/${exe}`;
    }
    const args = ['--line', String(line), ...(column ? ['--column', String(column)] : []), filePath];
    return { kind: 'exec', command, args };
  }

  if (editorId === 'sublime') {
    const command = mac ? `${appPath}/Contents/SharedSupport/bin/subl` : appPath;
    return { kind: 'exec', command, args: [`${filePath}:${at}`] };
  }

  if (editorId === 'zed') {
    const command = mac ? `${appPath}/Contents/MacOS/cli` : appPath;
    return { kind: 'exec', command, args: [`${filePath}:${at}`] };
  }

  return null;
}
