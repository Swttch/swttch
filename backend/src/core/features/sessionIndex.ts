import { open, readdir, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { filterActiveChain } from './activeChain';
import { scanJsonlLines } from './scanJsonl';
import { createWorkflowProjection, type WorkflowProjection } from './workflow-tracker';

// Raw JSONL entry - passed through as-is to match Kotlin backend
export type SessionMessage = Record<string, unknown>;

/**
 * Where one entry of a session's active chain is written, and the two fields the chain is decided by (#680).
 *
 * A session file can be hundreds of megabytes, almost all of it tool results. Parsing all of it and keeping
 * the result is what made the backend hold a gigabyte per long session, so what is kept is this: enough to
 * know the chain (the uuid and its parent) and to read an entry back when it is asked for (the file, the
 * offset and the length of its line).
 */
export interface IndexedEntry {
  uuid?: string;
  parentUuid?: string | null;
  file: string;
  offset: number;
  length: number;
  /**
   * Set for an entry of a subagent's own transcript, which the chain shows as a progress record of the call
   * that ran it. The record is made from the entry when it is read.
   */
  progressOf?: { toolUseId: string; agentId: string };
}

/** What is known of a session, without the session. */
export interface SessionIndex {
  /** The active chain, in order. */
  entries: IndexedEntry[];
  /**
   * The user entries and queue records of the active chain, which is all the prompt history and the send
   * index read. The tool results among them (most of a long transcript) are reduced to what says they are
   * tool results.
   */
  promptChain: SessionMessage[];
  /** What `reconstructWorkflowTasks` reads of the active chain. See `createWorkflowProjection`. */
  workflowChain: SessionMessage[];
}

interface PromptCandidate {
  uuid: string | undefined;
  entry: SessionMessage;
}

/** Everything the main file's lines have told, which a longer file adds to rather than starts over. */
interface FileScan {
  entries: IndexedEntry[];
  /** The offset just after the last line that ends in a newline. */
  completeThrough: number;
  size: number;
  /** The last line had no newline: it may be unfinished, so a longer file is read again from its start. */
  endedUnterminated: boolean;
  /** The ids of the calls that start a subagent, and the agent each result named. */
  taskToolUseIds: Set<string>;
  agentIdByToolUse: Map<string, string>;
  /** Where in `entries` the call with each id is (the last place it appears). */
  callIndexByToolUse: Map<string, number>;
  workflow: WorkflowProjection;
  prompts: PromptCandidate[];
}

const AGENT_ID_PATTERN = /agentId:\s*([a-f0-9]+)/;

function newFileScan(): FileScan {
  return {
    entries: [],
    completeThrough: 0,
    size: 0,
    endedUnterminated: false,
    taskToolUseIds: new Set(),
    agentIdByToolUse: new Map(),
    callIndexByToolUse: new Map(),
    workflow: createWorkflowProjection(),
    prompts: [],
  };
}

function contentBlocks(entry: SessionMessage): Array<Record<string, unknown>> {
  const message = entry.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return Array.isArray(content) ? (content as Array<Record<string, unknown>>) : [];
}

/** The text of a tool result's content, which is a string or a list of blocks. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  let text = '';
  for (const item of content) {
    if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'text') {
      text += (item as Record<string, unknown>).text ?? '';
    }
  }
  return text;
}

/** A user entry that answers a tool call, reduced to what says so and the flags the prompt tests read. */
function toolResultStub(entry: SessionMessage): SessionMessage {
  const stub: SessionMessage = { type: 'user' };
  for (const key of ['uuid', 'parentUuid', 'isMeta', 'isCompactSummary', 'isSidechain', 'isSynthetic', 'sourceToolUseID', 'permissionMode', 'timestamp']) {
    if (entry[key] !== undefined) stub[key] = entry[key];
  }
  stub.message = {
    role: 'user',
    content: contentBlocks(entry)
      .filter(b => b.type === 'tool_result')
      .map(b => ({ type: 'tool_result', tool_use_id: b.tool_use_id })),
  };
  return stub;
}

/** Take one parsed line of the main file into the scan. */
function takeLine(scan: FileScan, file: string, offset: number, length: number, entry: SessionMessage): void {
  const position = scan.entries.length;
  // The chain is decided by `uuid` and `parentUuid` exactly as the entry gives them.
  scan.entries.push({
    uuid: entry.uuid as string | undefined,
    parentUuid: entry.parentUuid as string | null | undefined,
    file,
    offset,
    length,
  });

  scan.workflow.add(entry);

  if (entry.type === 'assistant') {
    for (const block of contentBlocks(entry)) {
      if (block.type !== 'tool_use' || (block.name !== 'Task' && block.name !== 'Agent')) continue;
      if (typeof block.id !== 'string') continue;
      scan.taskToolUseIds.add(block.id);
      scan.callIndexByToolUse.set(block.id, position);
    }
    return;
  }

  if (entry.type === 'user') {
    let answersToolCall = false;
    for (const block of contentBlocks(entry)) {
      if (block.type !== 'tool_result') continue;
      answersToolCall = true;
      const toolUseId = block.tool_use_id;
      if (typeof toolUseId !== 'string' || !scan.taskToolUseIds.has(toolUseId)) continue;
      const match = AGENT_ID_PATTERN.exec(resultText(block.content));
      if (match) scan.agentIdByToolUse.set(toolUseId, match[1]);
    }
    scan.prompts.push({ uuid: typeof entry.uuid === 'string' ? entry.uuid : undefined, entry: answersToolCall ? toolResultStub(entry) : entry });
    return;
  }

  if (entry.type === 'queue-operation') {
    scan.prompts.push({ uuid: typeof entry.uuid === 'string' ? entry.uuid : undefined, entry });
  }
}

/** Read the main file from where the scan stopped. */
async function scanMainFile(scan: FileScan, file: string): Promise<void> {
  const result = await scanJsonlLines(file, scan.completeThrough, line => {
    let entry: SessionMessage;
    try {
      entry = JSON.parse(line.text) as SessionMessage;
    } catch {
      // Skip malformed lines
      return;
    }
    takeLine(scan, file, line.offset, line.length, entry);
    scan.endedUnterminated = !line.terminated;
  });
  scan.completeThrough = result.completeThrough;
  scan.size = result.size;
  if (result.completeThrough === result.size) scan.endedUnterminated = false;
}

/** Map each call to a subagent to its agent, from the `.meta.json` the CLI writes beside each subagent transcript. */
async function readSubagentMetaMappings(subagentsDir: string): Promise<Map<string, string>> {
  const toolUseToAgentId = new Map<string, string>();
  let names: string[];
  try {
    names = await readdir(subagentsDir);
  } catch {
    return toolUseToAgentId;
  }
  for (const name of names) {
    const match = /^agent-(.+)\.meta\.json$/.exec(name);
    if (!match) continue;
    try {
      const meta = JSON.parse(await readFile(join(subagentsDir, name), 'utf-8')) as Record<string, unknown>;
      if (typeof meta.toolUseId === 'string') toolUseToAgentId.set(meta.toolUseId, match[1]);
    } catch {
      // Unreadable or half-written meta file — this agent simply has no match
    }
  }
  return toolUseToAgentId;
}

/** The entries of one subagent's transcript, as the progress records of the call that ran it. */
async function scanSubagent(subagentsDir: string, toolUseId: string, agentId: string): Promise<IndexedEntry[]> {
  const file = join(subagentsDir, `agent-${agentId}.jsonl`);
  const found: IndexedEntry[] = [];
  await scanJsonlLines(file, 0, line => {
    let entry: SessionMessage;
    try {
      entry = JSON.parse(line.text) as SessionMessage;
    } catch {
      return;
    }
    if (entry.type !== 'assistant' && entry.type !== 'user') return;
    found.push({
      uuid: entry.uuid as string | undefined,
      parentUuid: entry.parentUuid as string | null | undefined,
      file,
      offset: line.offset,
      length: line.length,
      progressOf: { toolUseId, agentId },
    });
  });
  return found;
}

/** Put the subagents' records in after the calls that ran them, and decide the active chain. */
async function deriveIndex(scan: FileScan, subagentsDir: string, hasSubagents: boolean): Promise<SessionIndex> {
  const all: IndexedEntry[] = scan.entries.slice();

  if (hasSubagents) {
    try {
      // The agentId line in the result wins; the meta file only fills in the calls whose result named no agent.
      const toolUseToAgentId = new Map(scan.agentIdByToolUse);
      for (const [toolUseId, agentId] of await readSubagentMetaMappings(subagentsDir)) {
        if (!toolUseToAgentId.has(toolUseId)) toolUseToAgentId.set(toolUseId, agentId);
      }

      if (toolUseToAgentId.size > 0) {
        const insertions: Array<{ afterIndex: number; entries: IndexedEntry[] }> = [];
        for (const [toolUseId, agentId] of toolUseToAgentId.entries()) {
          const afterIndex = scan.callIndexByToolUse.get(toolUseId);
          if (afterIndex === undefined) continue;
          try {
            const progress = await scanSubagent(subagentsDir, toolUseId, agentId);
            if (progress.length > 0) insertions.push({ afterIndex, entries: progress });
          } catch {
            // Subagent file missing or unreadable — skip gracefully
          }
        }
        // Insert in reverse order of index so earlier insertions don't shift later indices
        insertions.sort((a, b) => b.afterIndex - a.afterIndex);
        for (const { afterIndex, entries } of insertions) {
          all.splice(afterIndex + 1, 0, ...entries);
        }
      }
    } catch {
      // Any unexpected error in subagent loading
    }
  }

  // Apply active chain filtering on the complete history. The filter reads only `uuid` and `parentUuid`.
  const entries = filterActiveChain(all as unknown as Record<string, any>[]) as unknown as IndexedEntry[];
  const active = new Set<string>();
  for (const entry of entries) if (typeof entry.uuid === 'string') active.add(entry.uuid);
  const isActive = (uuid: string | undefined) => uuid === undefined || active.has(uuid);

  return {
    entries,
    promptChain: scan.prompts.filter(p => isActive(p.uuid)).map(p => p.entry),
    workflowChain: scan.workflow.entriesFor(isActive),
  };
}

interface CachedIndex {
  /** The scan the index was made from; a longer file continues it. */
  scan: FileScan;
  mtimeMs: number;
  size: number;
  /** mtimeMs of the subagents dir, or -1 when it does not exist. Adding or removing agent files bumps it. */
  subagentsMtimeMs: number;
  index: SessionIndex;
}

const MAX_CACHED_SESSIONS = 4;
const indexCache = new Map<string, CachedIndex>();
const building = new Map<string, Promise<CachedIndex>>();

function storeIndex(key: string, cached: CachedIndex): void {
  // delete + set moves the key to the end of the Map, marking it most-recently-used.
  indexCache.delete(key);
  indexCache.set(key, cached);
  while (indexCache.size > MAX_CACHED_SESSIONS) {
    const oldest = indexCache.keys().next().value;
    if (oldest === undefined) break;
    indexCache.delete(oldest);
  }
}

/**
 * The index of a session's active chain, from the cache when the file has not changed.
 *
 * A file that has only grown (the CLI appends) is read from where the last read stopped, not from the
 * start; anything else is read again whole. Either way the file is read as a stream and nothing but the
 * index is kept: see `IndexedEntry`.
 */
export async function getSessionIndex(sessionFile: string, sessionsPath: string, sessionId: string): Promise<SessionIndex> {
  // stat the main file first: it provides the cache fingerprint and throws (ENOENT) for a missing session.
  const main = await stat(sessionFile);
  const subagentsDir = join(sessionsPath, sessionId, 'subagents');
  let subagentsMtimeMs = -1;
  let hasSubagents = false;
  try {
    subagentsMtimeMs = (await stat(subagentsDir)).mtimeMs;
    hasSubagents = true;
  } catch {
    // No subagents directory
  }

  const cached = indexCache.get(sessionFile);
  if (cached && cached.mtimeMs === main.mtimeMs && cached.size === main.size && cached.subagentsMtimeMs === subagentsMtimeMs) {
    storeIndex(sessionFile, cached);
    return cached.index;
  }

  const waiting = building.get(sessionFile);
  if (waiting) {
    const built = await waiting;
    if (built.mtimeMs === main.mtimeMs && built.size === main.size && built.subagentsMtimeMs === subagentsMtimeMs) return built.index;
  }

  const build = (async (): Promise<CachedIndex> => {
    const previous = indexCache.get(sessionFile);
    const grew = previous !== undefined && !previous.scan.endedUnterminated && main.size >= previous.scan.size && previous.scan.size === previous.scan.completeThrough;
    const scan = grew ? previous!.scan : newFileScan();
    await scanMainFile(scan, sessionFile);
    const index = await deriveIndex(scan, subagentsDir, hasSubagents);
    const next: CachedIndex = { scan, mtimeMs: main.mtimeMs, size: main.size, subagentsMtimeMs, index };
    storeIndex(sessionFile, next);
    return next;
  })();
  building.set(sessionFile, build);
  try {
    return (await build).index;
  } finally {
    if (building.get(sessionFile) === build) building.delete(sessionFile);
  }
}

/** Read what a stretch of the chain says, from where it is written. Entries come back in the order given. */
export async function readIndexedEntries(entries: readonly IndexedEntry[]): Promise<SessionMessage[]> {
  if (entries.length === 0) return [];
  // Neighbouring entries are usually neighbours in the file, so they are read together: one read per run.
  const MAX_GAP = 8 * 1024;
  const runs: Array<{ file: string; from: number; to: number; members: number[] }> = [];
  entries.forEach((entry, i) => {
    const last = runs[runs.length - 1];
    if (last && last.file === entry.file && entry.offset >= last.to && entry.offset - last.to <= MAX_GAP) {
      last.to = entry.offset + entry.length;
      last.members.push(i);
    } else {
      runs.push({ file: entry.file, from: entry.offset, to: entry.offset + entry.length, members: [i] });
    }
  });

  const out: Array<SessionMessage | undefined> = new Array(entries.length);
  const handles = new Map<string, Awaited<ReturnType<typeof open>>>();
  try {
    for (const run of runs) {
      let handle = handles.get(run.file);
      if (!handle) {
        handle = await open(run.file, 'r');
        handles.set(run.file, handle);
      }
      const buffer = Buffer.allocUnsafe(run.to - run.from);
      let read = 0;
      while (read < buffer.length) {
        const { bytesRead } = await handle.read(buffer, read, buffer.length - read, run.from + read);
        if (bytesRead === 0) break;
        read += bytesRead;
      }
      for (const i of run.members) {
        const entry = entries[i];
        const start = entry.offset - run.from;
        if (start + entry.length > read) continue; // the file is shorter than when it was indexed
        let parsed: SessionMessage;
        try {
          parsed = JSON.parse(buffer.toString('utf8', start, start + entry.length)) as SessionMessage;
        } catch {
          continue; // the file changed under the index
        }
        out[i] = entry.progressOf ? progressRecord(parsed, entry.progressOf) : parsed;
      }
    }
  } finally {
    await Promise.all([...handles.values()].map(h => h.close().catch(() => undefined)));
  }
  return out.filter((m): m is SessionMessage => m !== undefined);
}

/** A subagent's entry as the record of progress of the call that ran it. */
function progressRecord(entry: SessionMessage, of: { toolUseId: string; agentId: string }): SessionMessage {
  return {
    type: 'progress',
    parentToolUseID: of.toolUseId,
    uuid: entry.uuid,
    parentUuid: entry.parentUuid,
    timestamp: entry.timestamp,
    data: {
      type: 'agent_progress',
      agentId: of.agentId,
      message: {
        type: entry.type,
        message: entry.message,
        uuid: entry.uuid,
        timestamp: entry.timestamp,
      },
    },
  };
}

/** The whole chain, read back. Held only as long as the caller holds it: nothing keeps it. */
export async function readWholeChain(index: SessionIndex): Promise<SessionMessage[]> {
  const CHUNK = 400;
  const chain: SessionMessage[] = [];
  for (let from = 0; from < index.entries.length; from += CHUNK) {
    chain.push(...(await readIndexedEntries(index.entries.slice(from, from + CHUNK))));
  }
  return chain;
}
