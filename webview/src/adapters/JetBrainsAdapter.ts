import { MessageType, ClientEnv } from '../shared';
import type { IdeAdapter } from './IdeAdapter';
import { getBridge } from '../api/bridge/Bridge';
import { assertFileOpened } from './openFileResult';
import { type Route, routeToPath } from '../router';
import { readWorkingDirFromUrl } from '@/contexts/workingDirParam';

/**
 * JetBrains IDE Adapter
 *
 * Communicates with the JetBrains IDE via WebSocket → Node.js backend → Kotlin RPC.
 * Opens new editor tabs, settings, and files within the IDE.
 */
export class JetBrainsAdapter implements IdeAdapter {
  readonly type = ClientEnv.JETBRAINS;

  isReady(): boolean {
    return getBridge().isConnected;
  }

  async openNewTab(): Promise<void> {
    await getBridge().request(MessageType.OPEN_NEW_TAB);
    console.log('[JetBrainsAdapter] Sent OPEN_NEW_TAB via WebSocket bridge');
  }

  async openSession(sessionId: string): Promise<void> {
    await getBridge().request(MessageType.OPEN_SESSION, { sessionId });
    console.log('[JetBrainsAdapter] Sent OPEN_SESSION via WebSocket bridge:', sessionId);
  }

  async openSettings(route?: Route): Promise<void> {
    // `path` tells Kotlin which settings page the new editor tab should land on.
    // Omitted → Kotlin falls back to the settings landing page.
    const path = route ? routeToPath(route) : undefined;
    await getBridge().request(MessageType.OPEN_SETTINGS, path ? { path } : {});
    console.log('[JetBrainsAdapter] Sent OPEN_SETTINGS via WebSocket bridge:', path ?? '(default)');
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
    console.log('[JetBrainsAdapter] Sent OPEN_FILE via WebSocket bridge:', filePath, line ?? '');
  }

  async openTerminal(workingDir: string): Promise<void> {
    await getBridge().request(MessageType.OPEN_TERMINAL, { workingDir });
    console.log('[JetBrainsAdapter] Sent OPEN_TERMINAL via WebSocket bridge:', workingDir);
  }

  async openUrl(url: string): Promise<void> {
    await getBridge().request(MessageType.OPEN_URL, { url });
    console.log('[JetBrainsAdapter] Sent OPEN_URL via WebSocket bridge:', url);
  }

  async restartBackend(): Promise<void> {
    await getBridge().request(MessageType.RESTART_BACKEND);
    console.log('[JetBrainsAdapter] Sent RESTART_BACKEND via WebSocket bridge');
  }
}
