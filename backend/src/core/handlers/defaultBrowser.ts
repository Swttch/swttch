import { execFile } from 'child_process';
import { homedir } from 'os';
import { join } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import { MessageType } from '../../shared';
import { consoleSafeExecOptions } from '../console-safe';
import type { IPCMessage } from '../types';

const BROWSERS: Array<[RegExp, string]> = [
  [/chrome(?!ium)|chromehtml/i, 'Google Chrome'],
  [/chromium/i, 'Chromium'],
  [/msedge|edge|msedgehtm/i, 'Microsoft Edge'],
  [/firefox|firefoxurl/i, 'Firefox'],
  [/safari/i, 'Safari'],
  [/brave/i, 'Brave'],
  [/opera|operastable/i, 'Opera'],
  [/vivaldi/i, 'Vivaldi'],
  [/company\.thebrowser|arc/i, 'Arc'],
  [/duckduckgo/i, 'DuckDuckGo'],
];

/** The name a browser id (a macOS bundle id, a Windows ProgId or a Linux desktop file) goes by, or the id itself. */
export function browserNameOf(id: string): string {
  return BROWSERS.find(([pattern]) => pattern.test(id))?.[1] ?? id;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, consoleSafeExecOptions({ timeout: 4000, maxBuffer: 4 * 1024 * 1024 }), (error, stdout) => resolve(error ? '' : stdout));
  });
}

/** The browser the operating system opens a web address in, by name; null when it cannot be found. */
export async function readDefaultBrowser(platform: NodeJS.Platform = process.platform): Promise<string | null> {
  if (platform === 'darwin') {
    const plist = join(homedir(), 'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist');
    const json = await run('plutil', ['-convert', 'json', '-o', '-', plist]);
    try {
      const handlers = (JSON.parse(json).LSHandlers ?? []) as Array<{ LSHandlerURLScheme?: string; LSHandlerRoleAll?: string }>;
      const id = handlers.find((h) => h.LSHandlerURLScheme === 'https')?.LSHandlerRoleAll;
      return id ? browserNameOf(id) : 'Safari';
    } catch {
      return 'Safari';
    }
  }
  if (platform === 'win32') {
    const out = await run('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId']);
    const id = /ProgId\s+REG_SZ\s+(\S+)/.exec(out)?.[1];
    return id ? browserNameOf(id) : null;
  }
  const out = (await run('xdg-settings', ['get', 'default-web-browser'])).trim();
  return out ? browserNameOf(out.replace(/\.desktop$/, '')) : null;
}

let cached: Promise<string | null> | undefined;

/** GET_DEFAULT_BROWSER: the name of the browser a page opened "in the browser" appears in, for the Browser pane's menu. */
export async function getDefaultBrowserHandler(connectionId: string, message: IPCMessage, connections: ConnectionManager): Promise<void> {
  cached ??= readDefaultBrowser();
  const name = await cached;
  connections.sendTo(connectionId, MessageType.ACK, { requestId: message.requestId, name });
}
