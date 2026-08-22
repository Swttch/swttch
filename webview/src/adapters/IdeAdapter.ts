import { ClientEnv } from '../shared';
import type { Route } from '../router';

/**
 * @deprecated Use ClientEnv from shared instead
 */
export const IdeAdapterType = ClientEnv;
export type IdeAdapterType = ClientEnv;

/**
 * IDE Adapter Interface
 *
 * Abstracts IDE-specific operations so the WebView can work
 * in both JetBrains IDE and browser environments.
 */
export interface IdeAdapter {
  /**
   * The type of environment this adapter handles
   */
  readonly type: ClientEnv;

  /**
   * Open a new tab/window
   * - In JetBrains: Opens a new editor tab via Kotlin bridge
   * - In Browser: Opens a new browser tab
   */
  openNewTab(): Promise<void>;

  /**
   * Open an existing session in a new tab/window
   * - In JetBrains: Opens a new editor tab navigated to the session via Kotlin bridge
   * - In Browser: Opens a new browser tab at the session route
   */
  openSession(sessionId: string): Promise<void>;

  /**
   * Open settings in a new tab/window
   * - In JetBrains: Opens a new editor tab navigated to settings
   * - In Browser: Opens a new browser tab with settings hash
   *
   * @param route which settings page to land on (e.g. `Route.SETTINGS_SPONSOR`).
   *   Omit to land on the settings landing page. Callers that need to respect
   *   the user's overlay/new-tab preference should go through `openSettingsAt()`
   *   rather than calling this directly.
   */
  openSettings(route?: Route): Promise<void>;

  /**
   * Open a file in the IDE editor, optionally focusing a 1-based line/column.
   * - In JetBrains: opens (and navigates to the line) via the Kotlin bridge
   * - In Browser: hands the path to the OS opener (line/column can't be focused)
   */
  openFile(filePath: string, line?: number, column?: number): Promise<void>;

  /**
   * Open Claude in an external terminal
   * - In JetBrains: Opens Claude in the IDE's built-in terminal
   * - In Browser: Opens the configured terminal app and runs claude
   */
  openTerminal(workingDir: string): Promise<void>;

  /**
   * Open the embedded browser's DevTools
   * - In JetBrains: Opens the JCEF DevTools window for the chat webview
   * - In Browser: Not applicable — the browser has its own DevTools, so the
   *   settings button that calls this renders disabled there
   *
   * Offered from the settings screen only. No key is bound to it: F12 used to be,
   * and the chat then swallowed the IDE's own F12 shortcuts (issue #333).
   */
  openDevTools(): Promise<void>;

  /**
   * Open a URL in an external browser
   * - In JetBrains: Delegates to Node.js backend which calls the bridge
   * - In Browser: Opens the URL in a new tab
   */
  openUrl(url: string): Promise<void>;

  /**
   * Trigger a backend restart.
   * - In JetBrains: Sends RESTART_BACKEND so the backend exits with the unified
   *   restart code and the IDE respawns it.
   * - In Browser: Same — sends RESTART_BACKEND so the backend restarts itself.
   * Behaves identically in both runtimes; no environment-specific branching.
   */
  restartBackend(): Promise<void>;

  /**
   * Check if the adapter is ready to use
   */
  isReady(): boolean;
}
