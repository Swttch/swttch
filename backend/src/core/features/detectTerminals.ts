import {
  TERMINAL_CATALOG,
  type TerminalCatalogEntry,
} from './appDetection/terminalCatalog';
import {
  resolveMacApp,
  resolveLinuxApp,
  resolveWindowsPath,
} from './appDetection/resolveApp';

/**
 * An installed terminal discovered on the user's machine. `name` is both the
 * user-facing label and the value persisted in `terminalApp`; `path` is the
 * launch target (an executable, or a macOS `.app` bundle).
 */
export interface TerminalInfo {
  id: string;
  name: string;
  path: string;
  isDefault: boolean;
}

async function resolveEntry(entry: TerminalCatalogEntry): Promise<string | null> {
  if (process.platform === 'darwin') {
    return entry.mac ? resolveMacApp(entry.mac) : null;
  }
  if (process.platform === 'win32') {
    return entry.win ? resolveWindowsPath(entry.win) : null;
  }
  return entry.linux ? resolveLinuxApp(entry.linux) : null;
}

/** Move the entry with `id` to the front and mark it the default. */
function promoteDefault(list: TerminalInfo[], id: string): boolean {
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  const [item] = list.splice(idx, 1);
  item.isDefault = true;
  list.unshift(item);
  return true;
}

/**
 * Detect installed terminals via the catalog + platform resolver (macOS bundle
 * ids, Windows exe paths, Linux PATH). A sensible default is guaranteed to lead
 * the list on each platform.
 */
export async function detectInstalledTerminals(): Promise<TerminalInfo[]> {
  const resolved = (
    await Promise.all(
      TERMINAL_CATALOG.map(async (entry) => {
        try {
          const path = await resolveEntry(entry);
          return path
            ? { id: entry.id, name: entry.name, path, isDefault: false }
            : null;
        } catch {
          return null;
        }
      }),
    )
  ).filter((t): t is TerminalInfo => t !== null);

  if (process.platform === 'darwin') {
    // Terminal.app always ships with macOS — guarantee it's present and first.
    if (!promoteDefault(resolved, 'terminal')) {
      resolved.unshift({
        id: 'terminal',
        name: 'Terminal',
        path: '/System/Applications/Utilities/Terminal.app',
        isDefault: true,
      });
    }
  } else if (process.platform === 'win32') {
    // Prefer Windows Terminal, else Command Prompt.
    if (
      !promoteDefault(resolved, 'windows-terminal') &&
      !promoteDefault(resolved, 'cmd')
    ) {
      resolved.unshift({
        id: 'cmd',
        name: 'Command Prompt',
        path: `${process.env['SYSTEMROOT'] ?? 'C:\\Windows'}\\System32\\cmd.exe`,
        isDefault: true,
      });
    }
  } else if (resolved.length > 0) {
    resolved[0].isDefault = true;
  }

  return resolved;
}
