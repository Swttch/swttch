export interface Bridge {
  openFile(path: string, line?: number, column?: number): Promise<void>;
  openDiff(params: {
    filePath: string;
    oldContent: string;
    newContent: string;
    toolUseId?: string;
  }): Promise<void>;
  applyDiff(params: {
    filePath: string;
    newContent: string;
    toolUseId?: string;
  }): Promise<{ applied: boolean }>;
  rejectDiff(params: { toolUseId?: string }): Promise<void>;
  /**
   * Ask the IDE host to reload the given files from disk. Used after the CLI
   * edits files directly, so open editor tabs reflect the new content even when
   * the IDE's native filesystem watcher misses the change (e.g. on Windows).
   */
  refreshFiles(params: { paths: string[] }): Promise<void>;
  createSession(workingDir?: string): Promise<void>;
  openNewTab(workingDir?: string): Promise<void>;
  openSession(sessionId: string, workingDir?: string): Promise<void>;
  /** @param path settings page to land on (e.g. '/settings/sponsor'); omit for the landing page. */
  openSettings(workingDir?: string, path?: string): Promise<void>;
  openTerminal(workingDir: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  pickFiles(options: {
    mode: 'files' | 'folders' | 'both';
    multiple?: boolean;
  }): Promise<{ paths: string[] }>;
  updatePlugin(): Promise<void>;
  requiresRestart(): Promise<boolean>;
  /**
   * Returns the IDE project root that contains [workingDir], or null when the
   * host has no IDE context (browser mode). The WebView uses this as the
   * ancestor cap in the working-directory dropdown so a user cannot navigate
   * above the IDE project they are inside.
   */
  getIdeRoot(workingDir?: string): Promise<string | null>;
  /**
   * Whether a live IDE host is currently attached to this bridge. Only the
   * JetBrains bridge tracks IDE (Kotlin RPC) clients; the browser bridge has no
   * host and omits this. Used to route a browser client's `openFile` to the IDE
   * when one is connected, so the file opens in the editor at its line/column
   * instead of the OS default app.
   */
  isConnected?(): boolean;
}
