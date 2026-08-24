import { realpathSync } from 'fs';
import { join, resolve, sep } from 'path';
import { readJsonlEntries, type JsonlEntry } from './readJsonlEntries';
import { getClaudeConfigDir } from './claudeConfigDir';

const SAFE_AGENT_ID = /^[a-zA-Z0-9_-]+$/;

// Cap the returned entries so a runaway/huge agent transcript cannot blow up the
// IPC payload or browser memory. Real transcripts observed so far are tens of KB
// (a few hundred lines); this is a generous ceiling, not a real paging scheme.
const MAX_ENTRIES = 2000;

export interface WorkflowAgentTranscript {
  entries: JsonlEntry[];
  truncated: boolean;
}

/**
 * Resolve `transcriptDir` against the Claude config dir's `projects` root and
 * reject anything that escapes it (path traversal defense — `transcriptDir` is
 * server-issued but round-tripped through the client, so it must be revalidated
 * here rather than trusted, matching findBackgroundTaskOutputPath.ts).
 */
function resolveTranscriptDir(transcriptDir: string): string | null {
  const projectsRoot = join(getClaudeConfigDir(), 'projects');
  let realProjectsRoot: string;
  try {
    realProjectsRoot = realpathSync(projectsRoot);
  } catch {
    return null;
  }

  const resolved = resolve(transcriptDir);
  let real: string;
  try {
    real = realpathSync(resolved);
  } catch {
    // Directory may not exist yet if the workflow just started — fall back to
    // the resolved (unverified-on-disk) path for the prefix check.
    real = resolved;
  }

  if (real !== realProjectsRoot && !real.startsWith(realProjectsRoot + sep)) return null;
  return real;
}

/**
 * Load one workflow agent's full transcript (`agent-<id>.jsonl` under
 * `transcriptDir`) as raw JSONL entries, ready for LoadedMessageDto conversion
 * on the webview side. Mirrors computeAgentStats' read of the same file in
 * workflow-tracker.ts, but returns entries instead of aggregated stats.
 */
export async function loadWorkflowAgentTranscript(payload: {
  transcriptDir: string;
  agentId: string;
}): Promise<WorkflowAgentTranscript> {
  const { transcriptDir, agentId } = payload;

  if (!transcriptDir || !agentId) return { entries: [], truncated: false };
  if (!SAFE_AGENT_ID.test(agentId)) return { entries: [], truncated: false };

  const dir = resolveTranscriptDir(transcriptDir);
  if (!dir) return { entries: [], truncated: false };

  const file = join(dir, `agent-${agentId}.jsonl`);
  let entries: JsonlEntry[];
  try {
    entries = await readJsonlEntries(file);
  } catch {
    // Not present yet (e.g. a running agent that hasn't written its first line) —
    // not an error, just nothing to show yet.
    return { entries: [], truncated: false };
  }

  const truncated = entries.length > MAX_ENTRIES;
  return { entries: truncated ? entries.slice(-MAX_ENTRIES) : entries, truncated };
}
