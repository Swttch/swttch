import { execFile } from 'child_process';

/**
 * Escape a string for embedding inside an `osascript -e` AppleScript string
 * literal: backslashes first, then double quotes.
 */
export function escapeForOsascript(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Build a PowerShell command that raises a Windows toast via WinRT, without
 * requiring any third-party module (e.g. BurntToast). Strings are embedded in
 * single-quoted PowerShell literals, so `'` is escaped as `''`.
 *
 * NOTE: Windows toasts are best-effort here — they surface reliably only under a
 * registered AppUserModelID; this uses a plain id and is not verified on a real
 * Windows host (see the macOS-only test environment).
 */
export function buildWindowsToastScript(title: string, body: string): string {
  const t = title.replace(/'/g, "''");
  const b = body.replace(/'/g, "''");
  return [
    "$ErrorActionPreference='Stop'",
    '[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]>$null',
    '$xml=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
    "$texts=$xml.GetElementsByTagName('text')",
    `$texts.Item(0).AppendChild($xml.CreateTextNode('${t}'))>$null`,
    `$texts.Item(1).AppendChild($xml.CreateTextNode('${b}'))>$null`,
    '$toast=[Windows.UI.Notifications.ToastNotification]::new($xml)',
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Claude Code GUI').Show($toast)",
  ].join(';');
}

/**
 * Raise a real OS desktop notification (macOS Notification Center / Windows
 * toast / Linux libnotify) directly from the backend — the same OS-native
 * approach used for sounds.
 *
 * Used when the IDE is in the background, where an in-IDE balloon would be
 * hidden behind other apps. Best-effort and fire-and-forget: a failure is logged
 * but never propagated.
 */
export function showOsNotification(title: string, body: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (err: Error | null) => {
      if (err) {
        console.error('[node-backend]', 'showOsNotification failed:', err.message);
      }
      resolve();
    };

    try {
      if (process.platform === 'darwin') {
        const script = `display notification "${escapeForOsascript(body)}" with title "${escapeForOsascript(title)}"`;
        execFile('osascript', ['-e', script], done);
      } else if (process.platform === 'win32') {
        execFile('powershell', ['-NoProfile', '-Command', buildWindowsToastScript(title, body)], done);
      } else {
        // notify-send takes title/body as separate args — no shell escaping needed.
        execFile('notify-send', [title, body], done);
      }
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
    }
  });
}
