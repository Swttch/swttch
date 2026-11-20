import { realpathSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve, sep } from 'path';
import { getTmpBase } from '../handlers/findBackgroundTaskOutputPath';
import { getClaudeConfigDir } from './claudeConfigDir';
import { conversationWindowStart } from './conversationWindow';

// Cap how much of a long-running Bash task's log we return in one shot. Counted in
// characters since that log is plain text. A backgrounded agent's record is JSONL and is
// not cut this way: it is sent in pages of conversation (see conversationWindow.ts).
const MAX_CHARS = 200_000;

export interface BackgroundTaskOutput {
  text: string;
  /** Something before what is sent was left out: a Bash log cut at its cap, or the pages of an agent's record before the window. */
  truncated: boolean;
  /** For an agent's record: the index of the first entry sent, 0 when the record is sent from its start. */
  startIndex?: number;
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
export async function loadBackgroundTaskOutput(payload: { outputFile: string; pages?: number }): Promise<BackgroundTaskOutput> {
  const { outputFile, pages = 1 } = payload;
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

  const record = agentRecordLines(text);
  if (record) {
    const start = conversationWindowStart(record.types, pages);
    return {
      text: start === 0 ? text : `${record.lines.slice(start).join('\n')}\n`,
      truncated: start > 0,
      startIndex: start,
    };
  }

  if (text.length <= MAX_CHARS) return { text, truncated: false };
  return { text: text.slice(-MAX_CHARS), truncated: true };
}

/**
 * The lines of a backgrounded agent's record and the `type` of each, or null for a plain text log (a Bash task's).
 * A record is told by its first line being a JSON object with a `type`; a line that does not parse (a half-written
 * last line of a record that is still being written) has no type and is kept as a line of its own.
 */
function agentRecordLines(text: string): { lines: string[]; types: Array<unknown> } | null {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length === 0) return null;
  const types = lines.map((line) => {
    try {
      return (JSON.parse(line) as { type?: unknown }).type;
    } catch {
      return undefined;
    }
  });
  const first = (() => {
    try {
      const parsed = JSON.parse(lines[0]);
      return parsed !== null && typeof parsed === 'object' && typeof (parsed as { type?: unknown }).type === 'string';
    } catch {
      return false;
    }
  })();
  return first ? { lines, types } : null;
}
