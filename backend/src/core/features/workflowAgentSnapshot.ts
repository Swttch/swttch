/**
 * Keeps the CLI's per-agent workflow entries so they survive a reload.
 *
 * The CLI reports an agent's label, model, promptPreview, attempt and error
 * only on the live `task_progress` stream, and persists none of it: its own
 * `journal.jsonl` holds `type`/`key`/`agentId`/`result` and nothing more. So
 * once a chat tab is reopened — or the IDE restarted — every workflow that had
 * already finished lost its agents' names and showed a column of ids instead
 * (issue #425 follow-up).
 *
 * Nothing can recover that from disk, because it was never written. What we can
 * do is write down what we saw while it was streaming. That is all this file
 * does: it stores the entries exactly as the CLI sent them, so the reload path
 * can hand back the same objects the live path did rather than a reconstruction.
 */

import { homedir } from 'os';
import { join } from 'path';
import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'fs/promises';
import type { WorkflowAgent } from '../../shared';

/**
 * Snapshots to keep. One small JSON file per workflow run, so this is a cap on
 * clutter rather than on space; a user who runs workflows daily still keeps
 * months of them. Oldest are dropped first.
 */
const MAX_SNAPSHOTS = 500;

/** Resolved per call rather than at import, so the home dir is read when used. */
function snapshotDir(): string {
  return join(homedir(), '.claude-code-gui', 'workflow-agents');
}

function snapshotPath(workflowId: string): string {
  return join(snapshotDir(), `${workflowId}.json`);
}

/**
 * A workflow id is a transcript dir basename (`wf_ce882bfa-ddf`). It is used to
 * build a path, so anything that could climb out of the snapshot dir is refused
 * rather than sanitised — a rejected write costs a reload's labels, a bad one
 * writes into the user's home.
 */
function isSafeWorkflowId(workflowId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(workflowId);
}

/**
 * Store the agents of a finished workflow. Called once the workflow reaches a
 * terminal status rather than on every delta: by then the entries carry
 * everything the CLI ever reported, and one write per run keeps a 100-agent
 * workflow from turning its progress stream into disk traffic.
 *
 * Failures are swallowed. This is a convenience for the next reload, and no
 * workflow should fail because a home directory is read-only or full.
 */
export async function saveWorkflowAgentSnapshot(workflowId: string, agents: WorkflowAgent[]): Promise<void> {
  if (!isSafeWorkflowId(workflowId) || agents.length === 0) return;
  try {
    await mkdir(snapshotDir(), { recursive: true });
    await writeFile(snapshotPath(workflowId), JSON.stringify(agents), 'utf8');
    await pruneOldSnapshots();
  } catch {
    // Best-effort: a missing snapshot only costs labels after a reload.
  }
}

/** The stored agents for a workflow, or undefined if it was never snapshotted. */
export async function loadWorkflowAgentSnapshot(workflowId: string): Promise<WorkflowAgent[] | undefined> {
  if (!isSafeWorkflowId(workflowId)) return undefined;
  try {
    const parsed: unknown = JSON.parse(await readFile(snapshotPath(workflowId), 'utf8'));
    if (!Array.isArray(parsed)) return undefined;
    const agents = parsed.filter((a): a is WorkflowAgent => !!a && typeof a === 'object');
    return agents.length > 0 ? agents : undefined;
  } catch {
    return undefined;
  }
}

async function pruneOldSnapshots(): Promise<void> {
  const dir = snapshotDir();
  const names = (await readdir(dir)).filter((n) => n.endsWith('.json'));
  if (names.length <= MAX_SNAPSHOTS) return;
  const dated = await Promise.all(
    names.map(async (name) => {
      try {
        return { name, mtime: (await stat(join(dir, name))).mtimeMs };
      } catch {
        return { name, mtime: 0 };
      }
    }),
  );
  dated.sort((a, b) => a.mtime - b.mtime);
  for (const { name } of dated.slice(0, dated.length - MAX_SNAPSHOTS)) {
    await unlink(join(dir, name)).catch(() => {});
  }
}
