import { realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { getTmpBase } from '../handlers/findBackgroundTaskOutputPath';
import { getClaudeConfigDir } from './claudeConfigDir';

// Cap how much of a long-running Bash task's log we return in one shot —
// mirrors loadWorkflowAgentTranscript's MAX_ENTRIES safety valve. Counted in
// characters here since the file is plain text, not JSONL.
const MAX_CHARS = 200_000;

export interface BackgroundTaskOutput {
  text: string;
  truncated: boolean;
}

/**
 * Read a background task's raw output file: a plain Bash task's stdout/stderr
 * log, written directly under the tmp root (issue #347) — or a backgrounded
 * Agent/Task's own JSONL transcript (issue #383), whose advertised path under
 * the tmp root is actually a *symlink* to the real transcript file the CLI
 * already writes under the Claude config dir's `projects/.../subagents/`
 * (confirmed by `ls -la` on a live one: `tasks/<id>.output -> ~/.claude/
 * projects/<proj>/<session>/subagents/agent-<id>.jsonl`). Either way
 * task_type 'local_bash'/'local_agent' has no agents array to render a
 * transcript picker for, so the detail modal shows this file directly.
 * `outputFile` is server-issued (WorkflowTask.outputFile) but round-tripped
 * through the client, so it is revalidated here rather than trusted — against
 * BOTH roots, since a real path can legitimately resolve under either.
 */
export async function loadBackgroundTaskOutput(payload: { outputFile: string }): Promise<BackgroundTaskOutput> {
  const { outputFile } = payload;
  if (!outputFile) return { text: '', truncated: false };

  let tmpRoot: string;
  try {
    tmpRoot = realpathSync(getTmpBase());
  } catch {
    return { text: '', truncated: false };
  }

  let projectsRoot: string | null;
  try {
    projectsRoot = realpathSync(join(getClaudeConfigDir(), 'projects'));
  } catch {
    projectsRoot = null;
  }

  const resolved = resolve(outputFile);
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    // Not written yet (task just started) — not an error, nothing to show.
    return { text: '', truncated: false };
  }

  const underTmpRoot = real === tmpRoot || real.startsWith(tmpRoot + sep);
  const underProjectsRoot = !!projectsRoot && (real === projectsRoot || real.startsWith(projectsRoot + sep));
  if (!underTmpRoot && !underProjectsRoot) return { text: '', truncated: false };

  let text: string;
  try {
    text = await readFile(real, 'utf-8');
  } catch {
    return { text: '', truncated: false };
  }

  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(-MAX_CHARS) : text, truncated };
}
