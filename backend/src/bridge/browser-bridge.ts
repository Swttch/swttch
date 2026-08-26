import { execFile, spawn } from 'child_process';
import type { Bridge } from './bridge-interface';
import { readMergedSettings } from '../core/features/settings';
import { Claude } from '../core/claude';
import { detectInstalledEditors } from '../core/features/detectEditors';
import {
  parseCustomIntegrationArguments,
  expandTargetPathArgument,
  TargetPathArgument,
} from '../core/features/appDetection/customIntegration';

/** Sentinel `openFilesWith` value meaning "use the configured custom editor". */
export const OPEN_FILES_WITH_CUSTOM = '$custom';

/**
 * Browser-mode bridge for dev environment.
 * Uses OS-native commands for file opening; other IDE-specific
 * operations are no-ops since there is no IDE host.
 */
export class BrowserBridge implements Bridge {
  // line/column are accepted for interface parity but can't be honored by the OS
  // opener (xdg-open/open/explorer) — line focus is a JetBrains-mode feature.
  async openFile(path: string, _line?: number, _column?: number, workingDir?: string): Promise<void> {
    // Per-project first, global as the fallback: which editor opens a file is an
    // ordinary per-project choice, the same one a terminal user makes (issue #7).
    const { settings } = await readMergedSettings(workingDir);
    const openFilesWith = settings['openFilesWith'] as string | null;
    const custom = settings['openFilesWithCustom'] as
      | { path?: string; arguments?: string }
      | null
      | undefined;

    // 1) Custom editor: a user-provided executable/app + argument template.
    if (openFilesWith === OPEN_FILES_WITH_CUSTOM && custom?.path) {
      const argv = parseCustomIntegrationArguments(custom.arguments || TargetPathArgument);
      const args = expandTargetPathArgument(argv, path);
      return this.launchApp(custom.path, args);
    }

    // 2) A named, detected editor — resolve its launch path, then launch.
    if (openFilesWith && openFilesWith !== OPEN_FILES_WITH_CUSTOM) {
      const editors = await detectInstalledEditors();
      const match = editors.find((e) => e.name === openFilesWith);
      if (match) {
        return this.launchApp(match.path, [path]);
      }
      // Uninstalled/renamed → fall through to the OS default opener.
    }

    // 3) OS default opener.
    return this.launchOsDefault(path);
  }

  /**
   * Launch an app with args. On macOS a `.app` bundle is opened via `open -a`
   * (the OS resolves the real executable); elsewhere the path is spawned
   * directly, detached so it outlives the backend.
   */
  private launchApp(appPath: string, args: string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (err: Error | null) => {
        if (err) {
          console.error('[node-backend]', 'Failed to open file:', err.message);
        }
        resolve();
      };
      if (process.platform === 'darwin' && appPath.endsWith('.app')) {
        execFile('open', ['-a', appPath, ...args], done);
      } else {
        try {
          spawn(appPath, args, { stdio: 'ignore', detached: true }).unref();
          resolve();
        } catch (e) {
          done(e as Error);
        }
      }
    });
  }

  /** Open a path with the OS default handler. */
  private launchOsDefault(path: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = (err: Error | null) => {
        if (err) {
          console.error('[node-backend]', 'Failed to open file:', err.message);
        }
        resolve();
      };
      if (process.platform === 'darwin') {
        execFile('open', [path], done);
      } else if (process.platform === 'win32') {
        // 'explorer' avoids cmd's & / special-char parsing issues.
        execFile('explorer', [path], done);
      } else {
        execFile('xdg-open', [path], done);
      }
    });
  }

  async openDiff(): Promise<void> {
    // no-op: diff viewer not available in browser mode
  }

  // no-op both ways: in a browser the webview opens and closes the diff itself
  // (a tab of its own or an overlay), so there is no window on this side to act
  // on. The backend still calls these unconditionally — which surface is in use
  // is the setting's business, not the caller's.
  async openDiffTab(): Promise<void> {
    // no-op
  }

  async closeDiffTab(): Promise<void> {
    // no-op
  }

  async applyDiff(): Promise<{ applied: boolean }> {
    return { applied: false };
  }

  async rejectDiff(): Promise<void> {
    // no-op
  }

  async closeDiff(): Promise<void> {
    // no-op: nothing was opened, since openDiff is a no-op here too
  }

  async refreshFiles(): Promise<void> {
    // no-op: browser mode has no IDE editor tabs to reload
  }

  /**
   * no-op: standalone has no host drawing a review of its own.
   *
   * A genuine no-op, unlike watchFile below. The review here is always drawn by
   * the webview, which is told over its own WebSocket — there is no second
   * surface to notify, so nothing is missing. The judgement is "would a user of
   * this environment be worse off without it": they would not.
   */
  async notifyReviewBaseChanged(): Promise<void> {
    // no-op
  }

  /** no-op, for the same reason: the webview redraws its own review. */
  async redrawReview(): Promise<void> {
    // no-op
  }

  /**
   * Watch the file ourselves, because standalone has no host to ask (#359).
   *
   * NOT a no-op like the rest of this class. The others are no-ops because the
   * thing they do — open an editor tab, reload one — only exists inside an IDE.
   * Noticing that a file changed is not like that: it matters just as much to
   * someone running the backend from a terminal, and the first cut of #359
   * shipped with only the IDE path wired up, so standalone users had no warning
   * at all until an approval was already blocked.
   *
   * `fs.watch` fires more than once for a single save on some platforms, and
   * fires for metadata changes too, so the content is compared before the
   * caller is told. That keeps a save that rewrote identical bytes from
   * interrupting a review that is still valid.
   */
  async watchFile(filePath: string, onChanged: () => void): Promise<() => void> {
    const { watch } = await import('fs');
    const { readFile } = await import('fs/promises');

    let lastSeen: string | null = null;
    try {
      lastSeen = await readFile(filePath, 'utf8');
    } catch {
      // Unreadable now (a Write creating a new file): a later create still
      // counts as a change, which is what leaving this null expresses.
    }

    let closed = false;
    let watcher: import('fs').FSWatcher | undefined;

    try {
      watcher = watch(filePath, { persistent: false }, () => {
        if (closed) return;
        void readFile(filePath, 'utf8')
          .then((current) => {
            if (closed || current === lastSeen) return;
            lastSeen = current;
            onChanged();
          })
          .catch(() => {
            // Deleted or briefly replaced mid-save. The approval gate reads the
            // file itself and will report it properly; guessing here would fire
            // on every editor that saves via rename.
          });
      });
      watcher.on('error', (err) => {
        console.error('[node-backend]', `Stopped watching ${filePath}:`, err);
      });
    } catch (err) {
      // Watching is best effort by contract — the gate is what protects the
      // file — so a platform that refuses gets no warning rather than an error.
      console.error('[node-backend]', `Could not watch ${filePath}:`, err);
    }

    return () => {
      closed = true;
      watcher?.close();
    };
  }

  async createSession(_workingDir?: string): Promise<void> {
    // no-op: handled by session reset in browser mode
  }

  async openNewTab(_workingDir?: string): Promise<void> {
    // no-op: no IDE tab management in browser mode
  }

  async openSession(_sessionId: string, _workingDir?: string): Promise<void> {
    // no-op: browser mode navigates to the session via URL
  }

  async setTabName(_panelId: string, _name: string): Promise<void> {
    // no-op: the name labels an IDE tab, and browser mode has none. A browser
    // client can still be told to rename (the tunnel shares one session with
    // the IDE), so this is silent rather than an error.
  }

  async openSettings(_workingDir?: string, _path?: string): Promise<void> {
    // no-op: browser mode opens the settings tab client-side via window.open
  }

  async openUrl(url: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const cb = (err: Error | null) => {
        if (err) {
          console.error('[node-backend]', 'Failed to open URL:', err.message);
        }
        resolve();
      };

      if (process.platform === 'darwin') {
        execFile('open', [url], cb);
      } else if (process.platform === 'win32') {
        // Use rundll32 to open URL — avoids cmd.exe & character parsing issues
        execFile('rundll32', ['url.dll,FileProtocolHandler', url], cb);
      } else {
        execFile('xdg-open', [url], cb);
      }
    });
  }

  async pickFiles(options: {
    mode: 'files' | 'folders' | 'both';
    multiple?: boolean;
  }): Promise<{ paths: string[] }> {
    const { mode, multiple = true } = options;

    if (process.platform === 'darwin') {
      return this.pickFilesMacOS(mode, multiple);
    } else if (process.platform === 'win32') {
      return this.pickFilesWindows(mode, multiple);
    } else {
      return this.pickFilesLinux(mode, multiple);
    }
  }

  private pickFilesMacOS(mode: string, multiple: boolean): Promise<{ paths: string[] }> {
    return new Promise((resolve) => {
      let script: string;
      const multipleClause = multiple ? ' with multiple selections allowed' : '';

      if (mode === 'folders') {
        if (multiple) {
          script = `
            set chosen to choose folder with prompt "Select folders"${multipleClause}
            set posixPaths to ""
            repeat with f in chosen
              set posixPaths to posixPaths & POSIX path of f & "\\n"
            end repeat
            return posixPaths
          `;
        } else {
          script = `return POSIX path of (choose folder with prompt "Select a folder")`;
        }
      } else {
        // mode === 'files' or 'both'
        if (multiple) {
          script = `
            set chosen to choose file with prompt "Select files"${multipleClause}
            set posixPaths to ""
            repeat with f in chosen
              set posixPaths to posixPaths & POSIX path of f & "\\n"
            end repeat
            return posixPaths
          `;
        } else {
          script = `return POSIX path of (choose file with prompt "Select a file")`;
        }
      }

      // osascript -e requires shell for proper AppleScript escaping
      // but the script content is fully controlled (no user input in the script itself)
      execFile('osascript', ['-e', script], (err, stdout) => {
        if (err) {
          // 사용자가 취소하면 에러가 발생 — 빈 배열 반환
          console.error('[node-backend]', 'pickFiles cancelled or failed:', err.message);
          resolve({ paths: [] });
          return;
        }

        const paths = stdout.trim().split('\n').filter((p) => p.length > 0);
        resolve({ paths });
      });
    });
  }

  private pickFilesWindows(mode: string, multiple: boolean): Promise<{ paths: string[] }> {
    return new Promise((resolve) => {
      let script: string;

      if (mode === 'folders') {
        // FolderBrowserDialog — 단일 선택만 지원
        script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = "Select a folder"
if ($dialog.ShowDialog() -eq 'OK') {
  Write-Output $dialog.SelectedPath
}`;
      } else {
        // OpenFileDialog
        script = `
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Title = "Select files"
$dialog.Filter = "All files (*.*)|*.*"
${multiple ? '$dialog.Multiselect = $true' : ''}
if ($dialog.ShowDialog() -eq 'OK') {
  $dialog.FileNames | ForEach-Object { Write-Output $_ }
}`;
      }

      // Use -Command with script passed as argument (no shell interpolation)
      execFile('powershell', ['-NoProfile', '-Command', script], (err, stdout) => {
        if (err) {
          console.error('[node-backend]', 'pickFiles cancelled or failed:', err.message);
          resolve({ paths: [] });
          return;
        }
        const paths = stdout.trim().split('\r\n').filter((p) => p.length > 0);
        resolve({ paths });
      });
    });
  }

  private pickFilesLinux(mode: string, multiple: boolean): Promise<{ paths: string[] }> {
    return new Promise((resolve) => {
      const args: string[] = ['--file-selection'];

      if (mode === 'folders') {
        args.push('--directory');
        args.push('--title=Select folders');
      } else {
        args.push('--title=Select files');
      }

      if (multiple) {
        args.push('--multiple');
        args.push('--separator=\\n');
      }

      // Use execFile with array args instead of exec with string interpolation
      execFile('zenity', args, (err, stdout) => {
        if (err) {
          // 사용자 취소 시 exit code 1
          console.error('[node-backend]', 'pickFiles cancelled or failed:', err.message);
          resolve({ paths: [] });
          return;
        }
        const paths = stdout.trim().split('\n').filter((p) => p.length > 0);
        resolve({ paths });
      });
    });
  }

  async updatePlugin(): Promise<void> {
    return new Promise<void>((resolve) => {
      const url = 'https://plugins.jetbrains.com/plugin/30313-claude-code-with-gui';
      const cb = (err: Error | null) => {
        if (err) {
          console.error('[node-backend]', 'Failed to open plugin marketplace URL:', err.message);
        }
        resolve();
      };

      if (process.platform === 'darwin') {
        execFile('open', [url], cb);
      } else if (process.platform === 'win32') {
        execFile('rundll32', ['url.dll,FileProtocolHandler', url], cb);
      } else {
        execFile('xdg-open', [url], cb);
      }
    });
  }

  async requiresRestart(): Promise<boolean> {
    return true;
  }

  async getIdeRoot(_workingDir?: string): Promise<string | null> {
    // Browser mode has no IDE host, so ancestor traversal is unbounded.
    return null;
  }

  async openDevTools(): Promise<void> {
    // no-op: there is no JCEF window to open here, and the browser already has
    // its own DevTools. The settings button that would call this renders
    // disabled without an IDE attached, so this is only a backstop.
  }

  async openTerminal(workingDir: string): Promise<void> {
    // The terminal is opened *in* this project, so its choice is resolved per
    // project too — global still applies when the project sets none (issue #7).
    const { settings } = await readMergedSettings(workingDir);
    const terminalApp = settings['terminalApp'] as string | null;

    // Resolve via Claude.which() (augmented PATH + PATHEXT-correct launcher on
    // win32) instead of a second, ad-hoc `where claude` — this keeps the
    // terminal's claude the SAME binary the backend itself resolves. Falls back
    // to a bare `claude` so the opened shell can still resolve it from its PATH.
    const claudePath = (await Claude.which()) ?? 'claude';

    if (process.platform === 'darwin') {
      const app = terminalApp || 'Terminal';
      // Escape both double quotes and backslashes for AppleScript string embedding
      const escapedDir = workingDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const escapedClaudePath = claudePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const isITerm = app === 'iTerm' || app === 'iTerm2' || app.toLowerCase().includes('iterm');
      const script = isITerm
        ? `tell application "${app}"
             activate
             set newWindow to (create window with default profile)
             tell current session of newWindow
               write text "cd \\"${escapedDir}\\" && \\"${escapedClaudePath}\\""
             end tell
           end tell`
        : `tell application "${app}"
             activate
             do script "cd \\"${escapedDir}\\" && \\"${escapedClaudePath}\\""
           end tell`;

      // Pass script as argument to osascript (no shell interpolation)
      execFile('osascript', ['-e', script], (err) => {
        if (err) {
          console.error('[node-backend]', 'Failed to open terminal:', err.message);
        }
      });
    } else if (process.platform === 'win32') {
      const app = terminalApp ?? '';

      if (!app) {
        // Use spawn with shell:true + proper quoting for cmd.exe start
        spawn('cmd', ['/c', 'start', '""', 'cmd', '/k', `cd /d "${workingDir}" && claude`], {
          stdio: 'ignore',
          detached: true,
          shell: false,
        }).unref();
      } else if (app === 'Windows Terminal' || app === 'wt') {
        spawn('wt', ['-d', workingDir, 'cmd', '/k', 'claude'], {
          stdio: 'ignore',
          detached: true,
        }).unref();
      } else if (app === 'PowerShell' || app === 'powershell') {
        spawn('powershell', ['-NoExit', '-Command', `Set-Location -LiteralPath '${workingDir.replace(/'/g, "''")}'; claude`], {
          stdio: 'ignore',
          detached: true,
        }).unref();
      } else if (app === 'Git Bash' || app === 'bash') {
        const gitBashPath = `${process.env['PROGRAMFILES'] ?? 'C:\\Program Files'}\\Git\\bin\\bash.exe`;
        spawn(gitBashPath, [`--cd=${workingDir}`, '-c', 'claude; exec bash'], {
          stdio: 'ignore',
          detached: true,
        }).unref();
      } else {
        spawn(app, [workingDir], {
          stdio: 'ignore',
          detached: true,
        }).unref();
      }
    } else {
      const terminal = terminalApp || 'x-terminal-emulator';
      // Must use 'bash -c' wrapper — terminal -e doesn't interpret shell syntax
      execFile(terminal, ['-e', 'bash', '-c', `cd '${workingDir.replace(/'/g, "'\\''")}' && exec '${claudePath.replace(/'/g, "'\\''")}'`], (err) => {
        if (err) {
          console.error('[node-backend]', 'Failed to open terminal:', err.message);
        }
      });
    }
  }
}
