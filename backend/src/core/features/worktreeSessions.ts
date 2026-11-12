import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { basename, join } from 'path';
import { createInterface } from 'readline';
import { isSameWorkingDir } from '../../shared';
import { getClaudeConfigDir } from './claudeConfigDir';
import { getProjectSessionsPath, normalizeProjectPath } from './getProjectSessionsPath';

/**
 * What the CLI records when a session is inside a git worktree it made
 * (`claude -w`, or the EnterWorktree tool): the directory the session was opened
 * in, and the worktree it moved to. Both are absolute paths as the CLI wrote them.
 */
export interface WorktreeState {
  originalCwd: string;
  worktreePath: string;
}

/**
 * The part of a transcript folder's name that sits between the repository and the
 * worktree's own name. The CLI keeps a worktree under `<repo>/.claude/worktrees/<name>`,
 * and a folder name is the path with every character that is not a letter or a
 * digit turned into `-`, so `/.claude/worktrees/` always reads `--claude-worktrees-`.
 */
const WORKTREE_FOLDER_MARK = '--claude-worktrees-';

/** Whether a folder under `projects/` holds the transcripts of a worktree. */
export function isWorktreeFolderName(folderName: string): boolean {
  return folderName.includes(WORKTREE_FOLDER_MARK);
}

interface CachedState {
  mtimeMs: number;
  size: number;
  state: WorktreeState | undefined;
}

// A transcript is only appended to, and the state is written near its start, so a
// file that has not changed gives the same answer. Keyed by path.
const stateByFile = new Map<string, CachedState>();

/**
 * The worktree state recorded in a transcript, or undefined when it holds none.
 *
 * Lines can be several megabytes long, so a line is only parsed once it names the
 * entry type. The first state that has both paths wins: a session that left the
 * worktree records a state without them.
 */
export async function readWorktreeState(filePath: string): Promise<WorktreeState | undefined> {
  let fileStat;
  try {
    fileStat = await stat(filePath);
  } catch {
    return undefined;
  }
  const cached = stateByFile.get(filePath);
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return cached.state;
  }

  const state = await scanForWorktreeState(filePath);
  stateByFile.set(filePath, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, state });
  return state;
}

function scanForWorktreeState(filePath: string): Promise<WorktreeState | undefined> {
  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let resolved = false;

    rl.on('line', (line) => {
      if (resolved || !line.includes('"worktree-state"')) return;
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          worktreeSession?: { originalCwd?: string; worktreePath?: string } | null;
        };
        const session = parsed.type === 'worktree-state' ? parsed.worktreeSession : undefined;
        if (session?.originalCwd && session.worktreePath) {
          resolved = true;
          rl.close();
          stream.destroy();
          resolve({ originalCwd: session.originalCwd, worktreePath: session.worktreePath });
        }
      } catch {
        // malformed line, skip
      }
    });

    rl.once('close', () => {
      if (!resolved) resolve(undefined);
    });
    stream.once('error', () => {
      if (!resolved) {
        resolved = true;
        resolve(undefined);
      }
    });
  });
}

/**
 * The working directory a worktree transcript folder stands for, or undefined
 * when its transcripts do not say.
 *
 * The transcript of a session that moved into a worktree holds the directory it
 * was opened in at its first `cwd`, but the CLI filed the whole transcript under
 * the worktree's folder. Only a path that spells the folder's own name is the
 * directory the folder stands for, and the recorded worktree path does.
 */
export async function worktreePathForFolder(
  folderPath: string,
  transcripts: string[],
): Promise<string | undefined> {
  const folderName = basename(folderPath);
  for (const file of transcripts) {
    const state = await readWorktreeState(join(folderPath, file));
    if (state && normalizeProjectPath(state.worktreePath) === folderName) {
      return state.worktreePath;
    }
  }
  return undefined;
}

/** A transcript that lives in a worktree's folder but was opened in another directory. */
export interface WorktreeOriginTranscript {
  /** The worktree's transcript folder. */
  sessionsPath: string;
  /** The transcript's file name, with `.jsonl`. */
  file: string;
  /** The worktree the session is in; the directory its rows belong to. */
  worktreePath: string;
}

const STATE_READ_CONCURRENCY = 10;

/**
 * The sessions that were opened in [workingDir] and stopped inside a worktree.
 *
 * The CLI moves such a session's whole transcript to the worktree's folder, so the
 * folder of [workingDir] no longer holds it. The state recorded in the transcript
 * says where the session was opened; those are found among the folders of the
 * worktrees of the repository [workingDir] belongs to.
 */
export async function findWorktreeOriginTranscripts(
  workingDir: string,
): Promise<WorktreeOriginTranscript[]> {
  const ownName = basename(await getProjectSessionsPath(workingDir));

  let folders: string[];
  try {
    folders = await readdir(join(getClaudeConfigDir(), 'projects'));
  } catch {
    return [];
  }

  // A worktree lives under its repository, and so does the directory it was opened
  // in, so the repository's part of the folder name leads the name of that directory.
  const candidates = folders.filter((name) => {
    const at = name.indexOf(WORKTREE_FOLDER_MARK);
    return at > 0 && ownName.startsWith(name.slice(0, at));
  });

  const found: WorktreeOriginTranscript[] = [];
  for (const name of candidates) {
    const sessionsPath = join(getClaudeConfigDir(), 'projects', name);
    let files: string[];
    try {
      files = (await readdir(sessionsPath)).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (let start = 0; start < files.length; start += STATE_READ_CONCURRENCY) {
      const chunk = files.slice(start, start + STATE_READ_CONCURRENCY);
      const states = await Promise.all(chunk.map((f) => readWorktreeState(join(sessionsPath, f))));
      chunk.forEach((file, index) => {
        const state = states[index];
        if (state && isSameWorkingDir(state.originalCwd, workingDir)) {
          found.push({ sessionsPath, file, worktreePath: state.worktreePath });
        }
      });
    }
  }
  return found;
}
