import { realpathSync } from 'fs';
import { join, resolve, sep } from 'path';
import { readJsonlEntries, type JsonlEntry } from './readJsonlEntries';
import { getClaudeConfigDir } from './claudeConfigDir';
import { conversationWindowStart } from './conversationWindow';

const SAFE_AGENT_ID = /^[a-zA-Z0-9_-]+$/;

export interface WorkflowAgentTranscript {
  entries: JsonlEntry[];
  /** Entries before the window were left out: the reader can ask for them a page at a time (see conversationWindow.ts). */
  truncated: boolean;
  /** The index of the first entry sent, 0 when the record is sent from its start. */
  startIndex: number;
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
 * Load one workflow agent's transcript (`agent-<id>.jsonl` under
 * `transcriptDir`) as raw JSONL entries, ready for LoadedMessageDto conversion
 * on the webview side: the last `pages` pages of conversation, with every entry between them
 * (see conversationWindow.ts). Mirrors computeAgentStats' read of the same file in
 * workflow-tracker.ts, but returns entries instead of aggregated stats.
 */
export async function loadWorkflowAgentTranscript(payload: {
  transcriptDir: string;
  agentId: string;
  pages?: number;
}): Promise<WorkflowAgentTranscript> {
  const { transcriptDir, agentId, pages = 1 } = payload;

  if (!transcriptDir || !agentId) return { entries: [], truncated: false, startIndex: 0 };
  if (!SAFE_AGENT_ID.test(agentId)) return { entries: [], truncated: false, startIndex: 0 };

  const dir = resolveTranscriptDir(transcriptDir);
  if (!dir) return { entries: [], truncated: false, startIndex: 0 };

  const file = join(dir, `agent-${agentId}.jsonl`);
  let entries: JsonlEntry[];
  try {
    entries = await readJsonlEntries(file);
  } catch {
    // Not present yet (e.g. a running agent that hasn't written its first line) —
    // not an error, just nothing to show yet.
    return { entries: [], truncated: false, startIndex: 0 };
  }

  const start = conversationWindowStart(entries.map((entry) => entry.type), pages);
  return { entries: start === 0 ? entries : entries.slice(start), truncated: start > 0, startIndex: start };
}
