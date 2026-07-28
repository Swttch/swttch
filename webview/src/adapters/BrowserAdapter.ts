import { MessageType, ClientEnv } from '../shared';
import type { IdeAdapter } from './IdeAdapter';
import { getBridge } from '../api/bridge/Bridge';
import { assertFileOpened } from './openFileResult';
import { Route, routeToPath } from '../router';
import { readWorkingDirFromUrl } from '@/contexts/workingDirParam';

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

  async openNewTab(): Promise<void> {
    // 새 탭은 항상 빈 세션(/sessions/new)으로 열기
    const url = new URL(window.location.href);
    url.hash = '';
    url.pathname = '/sessions/new';
    const newWindow = window.open(url.toString(), '_blank');

    if (!newWindow) {
      throw new Error('Failed to open new tab. Pop-up might be blocked.');
    }

    console.log('[BrowserAdapter] Opened new browser tab');
  }

  async openSession(sessionId: string): Promise<void> {
    const url = new URL(window.location.href);
    url.hash = '';
    url.pathname = `/sessions/${sessionId}`;
    const newWindow = window.open(url.toString(), '_blank');

    if (!newWindow) {
      throw new Error('Failed to open session tab. Pop-up might be blocked.');
    }

    console.log('[BrowserAdapter] Opened session in new browser tab:', sessionId);
  }

  async openSettings(route?: Route): Promise<void> {
    const url = new URL(window.location.href);
    url.hash = '';
    // The query (workingDir etc.) rides along on window.location.href — without
    // it the new tab has no working directory and bounces to the project picker.
    url.pathname = routeToPath(route ?? Route.SETTINGS_GENERAL);
    const newWindow = window.open(url.toString(), '_blank');

    if (!newWindow) {
      throw new Error('Failed to open settings tab. Pop-up might be blocked.');
    }

    console.log('[BrowserAdapter] Opened settings in new browser tab:', url.pathname);
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
