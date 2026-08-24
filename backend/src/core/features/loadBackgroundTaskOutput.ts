import { realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve, sep } from 'path';
import { getTmpBase } from '../handlers/findBackgroundTaskOutputPath';

// Cap how much of a long-running Bash task's log we return in one shot —
// mirrors loadWorkflowAgentTranscript's MAX_ENTRIES safety valve. Counted in
// characters here since the file is plain text, not JSONL.
const MAX_CHARS = 200_000;

export interface BackgroundTaskOutput {
  text: string;
  truncated: boolean;
}

/**
 * Read a background Bash task's raw stdout/stderr log (issue #347: the
 * Background tasks detail modal shows this for task_type 'local_bash', which
 * has no agents to render a transcript for). `outputFile` is server-issued
 * (WorkflowTask.outputFile) but round-tripped through the client, so it is
 * revalidated against the tmp root here rather than trusted.
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

  const resolved = resolve(outputFile);
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    // Not written yet (task just started) — not an error, nothing to show.
    return { text: '', truncated: false };
  }
  if (real !== tmpRoot && !real.startsWith(tmpRoot + sep)) return { text: '', truncated: false };

  let text: string;
  try {
    text = await readFile(real, 'utf-8');
  } catch {
    return { text: '', truncated: false };
  }

  const truncated = text.length > MAX_CHARS;
  return { text: truncated ? text.slice(-MAX_CHARS) : text, truncated };
}
