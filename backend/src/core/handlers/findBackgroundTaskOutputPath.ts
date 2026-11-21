import { realpathSync } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { getProjectSessionsPath } from '../features/getProjectSessionsPath';

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

/**
 * Where a background task's output is, by its task id.
 *
 * The runtime directory under the tmp root is looked in first: it is where the CLI writes the file of a task that is
 * running. It is also cleared, so a task that ended long ago is no longer there. A sub-agent's own record is kept for
 * good beside its session (`<session>/subagents/agent-<id>.jsonl`, and a backgrounded agent's task id IS its agent
 * id), so when the session is named that is where a task that is gone from the runtime directory is still found.
 */
export async function findBackgroundTaskOutputPath(
  payload: { taskId: string; workingDir: string; sessionId?: string },
): Promise<{ path: string | null }> {
  const found = await findInRuntimeDir(payload);
  if (found.path || !payload.sessionId) return found;
  return findSubagentRecord({ taskId: payload.taskId, workingDir: payload.workingDir, sessionId: payload.sessionId });
}

/** A sub-agent's record kept beside its session, or null when the agent has none there. */
async function findSubagentRecord(
  payload: { taskId: string; workingDir: string; sessionId: string },
): Promise<{ path: string | null }> {
  const { taskId, workingDir, sessionId } = payload;
  if (!taskId || !workingDir || !sessionId) return { path: null };
  if (!SAFE_TASK_ID.test(taskId) || !SAFE_TASK_ID.test(sessionId)) return { path: null };
  const file = join(await getProjectSessionsPath(workingDir), sessionId, 'subagents', `agent-${taskId}.jsonl`);
  try {
    return (await stat(file)).isFile() ? { path: file } : { path: null };
  } catch {
    return { path: null };
  }
}

async function findInRuntimeDir(
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
