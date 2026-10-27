import { createHash } from 'crypto';
import { copyFile, mkdir, stat } from 'fs/promises';
import { homedir } from 'os';
import { basename, join } from 'path';

/**
 * A copy of every file Claude sends with `SendUserFile`, kept so the file can
 * still be shown after the original is moved or deleted (#593).
 *
 * Claude Desktop uploads a sent file when it is sent, so a file deleted a second
 * later is still on screen. The CLI's result carries only the path, so a viewer
 * that reads the path afterwards loses it. This store is where that copy is made.
 *
 * Only files up to {@link SENT_FILE_MAX_BYTES} are kept: Desktop does not upload
 * a larger one either. Only what the plugin was running to see is kept; a
 * session opened later finds whatever is still at the original path.
 */
export const SENT_FILE_MAX_BYTES = 30 * 1024 * 1024;

function storeRoot(): string {
  return join(process.env.CCG_HOME?.trim() || join(homedir(), '.claude-code-gui'), 'sent-files');
}

/** Where the copy of the file once at `originalPath` lives. One copy per path: sending it again replaces it. */
export function sentFileCopyPath(originalPath: string): string {
  const key = createHash('sha256').update(originalPath).digest('hex').slice(0, 32);
  return join(storeRoot(), key, basename(originalPath));
}

/** Copy `originalPath` into the store. Never throws: a file that cannot be kept is simply not kept. */
export async function keepSentFile(originalPath: string): Promise<void> {
  try {
    const info = await stat(originalPath);
    if (!info.isFile() || info.size > SENT_FILE_MAX_BYTES) return;
    const target = sentFileCopyPath(originalPath);
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(originalPath, target);
  } catch {
    // Gone before it could be copied, or unreadable: the preview falls back to the path.
  }
}

/**
 * The path to read for a sent file: the original while it is there, its kept copy
 * once it is not, and the original again when there is no copy either (so the
 * caller reports the original's error).
 */
export async function resolveSentFilePath(originalPath: string): Promise<string> {
  try {
    await stat(originalPath);
    return originalPath;
  } catch {
    const copy = sentFileCopyPath(originalPath);
    try {
      await stat(copy);
      return copy;
    } catch {
      return originalPath;
    }
  }
}

/** The paths of the files a `user` stream event reports as sent with `SendUserFile`, or an empty list. */
export function sentFilePathsOf(event: Record<string, unknown>): string[] {
  if (event['type'] !== 'user') return [];
  const result = event['tool_use_result'] as { attachments?: unknown } | undefined;
  if (!result || !Array.isArray(result.attachments)) return [];
  const paths: string[] = [];
  for (const attachment of result.attachments) {
    const path = (attachment as { path?: unknown } | null)?.path;
    if (typeof path === 'string' && path !== '') paths.push(path);
  }
  return paths;
}
