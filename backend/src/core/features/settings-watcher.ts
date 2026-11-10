import { watch, existsSync, type FSWatcher } from 'fs';
import { join } from 'path';
import { readMergedSettings } from './settings';
import { readMergedClaudeSettings } from './claude-settings';
import { getClaudeConfigDir } from './claudeConfigDir';
import { MessageType } from '../../shared';
import { ideSharedDir } from '../../config/ccg-home';

const DEBOUNCE_MS = 300;

interface WatchEntry {
  watcher: FSWatcher;
  debounceTimer: NodeJS.Timeout | null;
}

type SettingsEvent = MessageType.SETTINGS_CHANGED | MessageType.CLAUDE_SETTINGS_CHANGED;
type SettingsChangedCallback = (
  event: SettingsEvent,
  data: { settings: Record<string, unknown>; overrides: string[] },
) => void;

export class SettingsFileWatcher {
  private watchers = new Map<string, WatchEntry>();
  private projectRefCounts = new Map<string, number>();
  private onSettingsChanged: SettingsChangedCallback;

  constructor(onSettingsChanged: SettingsChangedCallback) {
    this.onSettingsChanged = onSettingsChanged;
  }

  /**
   * Start watching global settings files.
   * Call this once on server startup.
   */
  startGlobalWatchers(): void {
    const claudeDir = getClaudeConfigDir();
    const appDir = ideSharedDir();

    this.watchDir(claudeDir, 'settings.json', async () => {
      const result = await readMergedClaudeSettings();
      this.onSettingsChanged(MessageType.CLAUDE_SETTINGS_CHANGED, result);
    });

    this.watchDir(claudeDir, 'settings.local.json', async () => {
      const result = await readMergedClaudeSettings();
      this.onSettingsChanged(MessageType.CLAUDE_SETTINGS_CHANGED, result);
    });

    this.watchDir(appDir, 'settings.js', async () => {
      const result = await readMergedSettings();
      this.onSettingsChanged(MessageType.SETTINGS_CHANGED, result);
    });
  }

  /**
   * Start watching project-level settings files.
   * Uses reference counting for multiple connections to same project.
   */
  registerProject(projectPath: string): void {
    const refCount = (this.projectRefCounts.get(projectPath) ?? 0) + 1;
    this.projectRefCounts.set(projectPath, refCount);

    if (refCount > 1) return; // Already watching

    const claudeDir = join(projectPath, '.claude');
    const appDir = join(projectPath, '.claude-code-gui');

    this.watchDir(claudeDir, 'settings.json', async () => {
      const result = await readMergedClaudeSettings(projectPath);
      this.onSettingsChanged(MessageType.CLAUDE_SETTINGS_CHANGED, result);
    });

    this.watchDir(claudeDir, 'settings.local.json', async () => {
      const result = await readMergedClaudeSettings(projectPath);
      this.onSettingsChanged(MessageType.CLAUDE_SETTINGS_CHANGED, result);
    });

    this.watchDir(appDir, 'settings.json', async () => {
      const result = await readMergedSettings(projectPath);
      this.onSettingsChanged(MessageType.SETTINGS_CHANGED, result);
    });
  }

  /**
   * Unregister a project. Stops watching when refCount reaches 0.
   */
  unregisterProject(projectPath: string): void {
    const refCount = (this.projectRefCounts.get(projectPath) ?? 0) - 1;

    if (refCount <= 0) {
      this.projectRefCounts.delete(projectPath);
      const claudeDir = join(projectPath, '.claude');
      const appDir = join(projectPath, '.claude-code-gui');
      this.unwatchDir(claudeDir);
      this.unwatchDir(appDir);
    } else {
      this.projectRefCounts.set(projectPath, refCount);
    }
  }

  /**
   * Stop all watchers. Call on server shutdown.
   */
  stopAll(): void {
    for (const [, entry] of this.watchers) {
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.watcher.close();
    }
    this.watchers.clear();
    this.projectRefCounts.clear();
    console.log('[node-backend]', 'All settings file watchers stopped');
  }

  private watchDir(dirPath: string, targetFile: string, onChange: () => Promise<void>): void {
    const watchKey = `${dirPath}::${targetFile}`;
    if (this.watchers.has(watchKey)) return;
    if (!existsSync(dirPath)) {
      console.log('[node-backend]', `Directory does not exist, skipping watch: ${dirPath}`);
      return;
    }

    try {
      const watcher = watch(dirPath, (_eventType, filename) => {
        if (filename !== targetFile) return;

        const entry = this.watchers.get(watchKey);
        if (!entry) return;

        if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
        entry.debounceTimer = setTimeout(() => {
          onChange().catch((err) => {
            console.error('[node-backend]', `Error handling settings file change in ${dirPath}:`, err);
          });
        }, DEBOUNCE_MS);
      });

      this.watchers.set(watchKey, { watcher, debounceTimer: null });
      console.log('[node-backend]', `Watching ${join(dirPath, targetFile)} for changes`);
    } catch (err) {
      console.error('[node-backend]', `Failed to watch ${dirPath}:`, err);
    }
  }

  private unwatchDir(dirPath: string): void {
    const prefix = `${dirPath}::`;
    for (const [key, entry] of this.watchers) {
      if (key.startsWith(prefix)) {
        if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
        entry.watcher.close();
        this.watchers.delete(key);
        console.log('[node-backend]', `Stopped watching ${key}`);
      }
    }
  }
}

// ─── Module-level singleton ───────────────────────────────────────────────────

let globalInstance: SettingsFileWatcher | null = null;

export function getSettingsWatcher(): SettingsFileWatcher | null {
  return globalInstance;
}

export function initSettingsWatcher(onSettingsChanged: SettingsChangedCallback): SettingsFileWatcher {
  if (globalInstance) {
    globalInstance.stopAll();
  }
  globalInstance = new SettingsFileWatcher(onSettingsChanged);
  return globalInstance;
}

export function stopSettingsWatcher(): void {
  if (globalInstance) {
    globalInstance.stopAll();
    globalInstance = null;
  }
}
