import { MessageType, ClientEnv } from '../shared';
import type { IdeAdapter } from './IdeAdapter';
import { getBridge } from '../api/bridge/Bridge';
import { assertFileOpened } from './openFileResult';
import { diffToPath } from '../router';
import { normalizeTabPath } from './tabPath';
import { readWorkingDirFromUrl } from '@/contexts/workingDirParam';

/** Browser tabs this page opened with `openTab`, by the address each shows. */
const openedTabs = new Map<string, Window>();

/**
 * The URL of `path` in a new tab, taken from the current page so the query (the
 * working directory) rides along; without it the new tab has no working
 * directory and bounces to the project picker. A session from another project
 * brings its own directory instead of this page's.
 */
function tabUrlFor(path: string, workingDir?: string): string {
  const url = new URL(window.location.href);
  url.hash = '';
  const [pathname, search] = path.split('?');
  url.pathname = pathname;
  if (search !== undefined) url.search = search;
  if (workingDir) url.searchParams.set('workingDir', workingDir);
  return url.toString();
}

/**
 * Browser Adapter
 *
 * Handles operations when running in a browser environment (dev mode).
 * Opens new browser tabs using window.open().
 */
export class BrowserAdapter implements IdeAdapter {
  readonly type = ClientEnv.BROWSER;

  isReady(): boolean {
    return true; // Browser is always ready
  }

  async newTab(path?: string): Promise<void> {
    // 새 탭은 항상 새로 연다. 경로가 없으면 빈 세션(/sessions/new).
    const url = new URL(window.location.href);
    url.hash = '';
    url.pathname = path ?? '/sessions/new';
    const newWindow = window.open(url.toString(), '_blank');

    if (!newWindow) {
      throw new Error('Failed to open new tab. Pop-up might be blocked.');
    }

    console.log('[BrowserAdapter] Opened new browser tab:', url.pathname);
  }

  async openTab(path: string, workingDir?: string): Promise<void> {
    const url = tabUrlFor(path, workingDir);
    const key = normalizeTabPath(path);

    // A tab this page opened for the same address before: go to it rather than
    // opening a copy. Navigating it again would reload a page the user may be
    // reading, so it is only brought forward.
    const known = openedTabs.get(key);
    if (known && !known.closed) {
      known.focus();
      console.log('[BrowserAdapter] Focused the browser tab already showing:', key);
      return;
    }

    // Named after the address, so a tab opened by an earlier copy of this page
    // (a reload loses `openedTabs`) is found by the browser itself.
    const opened = window.open(url, `swttch-tab:${key}`);
    if (!opened) {
      throw new Error('Failed to open tab. Pop-up might be blocked.');
    }
    openedTabs.set(key, opened);

    console.log('[BrowserAdapter] Opened browser tab:', key);
  }

  async openDiff(toolUseId: string): Promise<void> {
    // The query (workingDir etc.) rides along the same way it does for any tab;
    // without it the new tab has no working directory and bounces to the picker.
    await this.openTab(diffToPath(toolUseId));
  }

  async openFile(filePath: string, line?: number, column?: number): Promise<void> {
    // Carry the project so the backend can resolve "open files with" per project
    // (issue #7). Read from the URL: openFile is called from many renderers that
    // do not thread the working directory down.
    const workingDir = readWorkingDirFromUrl();
    const res = await getBridge().request(MessageType.OPEN_FILE, {
      filePath,
      line,
      column,
      workingDir,
    });
    assertFileOpened(res, filePath);
    console.log('[BrowserAdapter] Sent OPEN_FILE request:', filePath, line ?? '');
  }

  async openFileWithSystemApp(filePath: string): Promise<void> {
    const res = await getBridge().request(MessageType.OPEN_FILE_WITH_SYSTEM_APP, { filePath, workingDir: readWorkingDirFromUrl() });
    assertFileOpened(res, filePath);
  }

  async revealFile(filePath: string): Promise<void> {
    const res = await getBridge().request(MessageType.REVEAL_FILE, { filePath, workingDir: readWorkingDirFromUrl() });
    assertFileOpened(res, filePath);
  }

  async openDevTools(): Promise<void> {
    // A browser opens its own DevTools with the user's own shortcut, and there is
    // no JCEF window for us to open. The settings button is disabled without an
    // IDE attached, so this only exists to satisfy the interface.
    console.warn('[BrowserAdapter] openDevTools() is a no-op outside an IDE');
  }

  async openTerminal(workingDir: string): Promise<void> {
    try {
      await getBridge().request(MessageType.OPEN_TERMINAL, { workingDir });
      console.log('[BrowserAdapter] Sent OPEN_TERMINAL request:', workingDir);
    } catch (error) {
      console.error('[BrowserAdapter] Failed to open terminal:', error);
    }
  }

  async openUrl(url: string): Promise<void> {
    // 'noopener,noreferrer' severs the opened tab's window.opener reference
    // (reverse-tabnabbing protection) for any externally-sourced URL.
    window.open(url, '_blank', 'noopener,noreferrer');
    console.log('[BrowserAdapter] Opened URL in new tab:', url);
  }

  async restartBackend(): Promise<void> {
    await getBridge().request(MessageType.RESTART_BACKEND);
    console.log('[BrowserAdapter] Sent RESTART_BACKEND via WebSocket bridge');
  }
}
