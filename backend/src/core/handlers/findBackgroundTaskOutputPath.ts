import { realpathSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';

const SAFE_TASK_ID = /^[a-zA-Z0-9_-]+$/;

function isAbsolutePath(p: string): boolean {
  // Unix absolute path or Windows drive letter
  return p.startsWith('/') || /^[A-Za-z]:[/\\]/.test(p);
}

function sanitizeProjectKey(workingDir: string): string {
  return workingDir.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function getTmpBase(): string {
  const envVal = process.env.CLAUDE_CODE_TMPDIR;
  if (envVal && envVal.length > 0) return envVal;
  if (process.platform === 'win32') return process.env.TEMP ?? 'C:\\Temp';
  return '/tmp';
}

export async function findBackgroundTaskOutputPath(
  payload: { taskId: string; workingDir: string },
): Promise<{ path: string | null }> {
  const { taskId, workingDir } = payload;

  if (!taskId || !workingDir) return { path: null };
  if (!SAFE_TASK_ID.test(taskId)) return { path: null };
  if (!isAbsolutePath(workingDir)) return { path: null };

  // Windows: no uid-based directory support
  if (process.platform === 'win32') return { path: null };

  const uid: number | null = process.getuid?.() ?? null;
  if (uid === null) return { path: null };

  const base = getTmpBase();
  let tmpRoot: string;
  try { tmpRoot = realpathSync(base); } catch { tmpRoot = base; }

  const projectKey = sanitizeProjectKey(workingDir);

  const baseDir = join(tmpRoot, `claude-${uid}`, projectKey);

  let runtimeDirs: string[];
  try {
    runtimeDirs = await readdir(baseDir);
  } catch {
    return { path: null };
  }

  const candidates: { path: string; mtime: number }[] = [];
  for (const dir of runtimeDirs) {
    const candidate = join(baseDir, dir, 'tasks', `${taskId}.output`);
    try {
      const s = await stat(candidate);
      if (s.isFile()) candidates.push({ path: candidate, mtime: s.mtimeMs });
    } catch {
      // not present, skip
    }
  }

  if (candidates.length === 0) return { path: null };
  candidates.sort((a, b) => b.mtime - a.mtime);
  return { path: candidates[0].path };
}
