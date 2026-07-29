import { getLogForwarder } from '@/api/logging';

export interface CopyFrontendLogsResult {
  ok: boolean;
  lineCount: number;
}

/**
 * Copy this tab's captured console history to the clipboard.
 *
 * `LogForwarder` intercepts `console.*` from startup, so the history exists
 * whether or not devtools were ever opened — which is the point: a user
 * reporting a bug can hand over the full front-end log without being walked
 * through opening the inspector first.
 */
export async function copyFrontendLogs(): Promise<CopyFrontendLogsResult> {
  const text = getLogForwarder()?.getHistoryText() ?? '';
  if (!text) return { ok: false, lineCount: 0 };

  const lineCount = text.split('\n').length;
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true, lineCount };
  } catch {
    // Clipboard access needs a focused, permitted document; report the failure
    // so the caller can tell the user instead of silently doing nothing.
    return { ok: false, lineCount };
  }
}
