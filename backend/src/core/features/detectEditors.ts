import { EDITOR_CATALOG, type EditorCatalogEntry } from './appDetection/editorCatalog';
import { resolveMacApp, resolveLinuxApp } from './appDetection/resolveApp';
import { resolveWindowsApp } from './appDetection/resolveWindows';

/**
 * An installed editor discovered on the user's machine.
 *
 * `name` is both the user-facing label and the value persisted in the
 * `openFilesWith` setting; `path` is the launch target (an executable, or a
 * macOS `.app` bundle) used by {@link BrowserBridge.openFile}.
 */
export interface EditorInfo {
  id: string;
  name: string;
  path: string;
}

/** Resolve a catalog entry's install path for the current platform. */
async function resolveEntry(entry: EditorCatalogEntry): Promise<string | null> {
  if (process.platform === 'darwin') {
    return entry.mac ? resolveMacApp(entry.mac) : null;
  }
  if (process.platform === 'win32') {
    return entry.win ? resolveWindowsApp(entry.win) : null;
  }
  return entry.linux ? resolveLinuxApp(entry.linux) : null;
}

/**
 * Detect installed editors/IDEs by probing the catalog with the platform
 * resolver (macOS bundle ids via Spotlight, Windows registry, Linux PATH).
 * Probes run concurrently; catalog order is preserved in the result.
 */
export async function detectInstalledEditors(): Promise<EditorInfo[]> {
  const resolved = await Promise.all(
    EDITOR_CATALOG.map(async (entry) => {
      try {
        const path = await resolveEntry(entry);
        return path ? { id: entry.id, name: entry.name, path } : null;
      } catch {
        return null;
      }
    }),
  );

  return resolved.filter((e): e is EditorInfo => e !== null);
}
