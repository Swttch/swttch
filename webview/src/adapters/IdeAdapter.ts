import { ClientEnv } from '../shared';

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
   * Open a tab/window of its own, whatever is open already.
   * - In JetBrains: Opens a new editor tab via Kotlin bridge
   * - In Browser: Opens a new browser tab
   *
   * @param path the page it lands on (e.g. `/sessions/new`); omit for a new conversation.
   */
  newTab(path?: string): Promise<void>;

  /**
   * Open the page at `path`, or go to the tab/window that is already showing it.
   *
   * The one way into a page of its own (a session, a settings page, a sub-agent
   * run): asking twice for the same page lands on the one tab instead of stacking
   * a copy each time. A caller that wants a copy anyway uses {@link newTab}.
   * - In JetBrains: the IDE finds the editor tab by the address it shows
   * - In Browser: reuses the browser tab it opened for that address
   *
   * @param path the page's address, e.g. `/sessions/<id>` or `/settings/sponsor`.
   * @param workingDir the project the page belongs to. For a page that is not this
   *   project's own (a session mention can point anywhere) it is carried in the
   *   address, so the page opens against the right tree.
   */
  openTab(path: string, workingDir?: string): Promise<void>;

  /**
   * Open the review for a proposed file edit in a tab/window of its own.
   *
   * - In Browser: opens a new browser tab at the diff route
   * - In JetBrains: not this way — an editor tab can only be opened by the IDE
   *   side, so the backend does it (see `useOpenDiffReview`). Implemented here
   *   as a no-op rather than left out, so a caller that reaches it anyway does
   *   nothing instead of throwing.
   */
  openDiff(toolUseId: string): Promise<void>;

  /**
   * Open a file in the IDE editor, optionally focusing a 1-based line/column.
   * - In JetBrains: opens (and navigates to the line) via the Kotlin bridge
   * - In Browser: hands the path to the OS opener (line/column can't be focused)
   */
  openFile(filePath: string, line?: number, column?: number): Promise<void>;

  /**
   * Hand a file to the system's default app for its type, even when the IDE has an
   * editor for it. Rejects when it could not be opened (same error as openFile).
   */
  openFileWithSystemApp(filePath: string): Promise<void>;

  /**
   * Show a file in the system's file manager, selected where the OS can. Rejects
   * when it could not be shown (same error as openFile).
   */
  revealFile(filePath: string): Promise<void>;

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
