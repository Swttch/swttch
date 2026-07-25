import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { resolveWslCwd } from '../wsl-path';
import { readMergedClaudeSettings } from '../features/claude-settings';
import {
  parseFileSuggestion,
  runFileSuggestionCommand,
  FILE_SUGGESTION_RESULT_CAP,
} from '../features/fileSuggestion';

const execFileAsync = promisify(execFile);

interface FileEntry {
  relativePath: string;
  type: 'file' | 'directory';
  matchIndices?: number[];
}

interface CacheEntry {
  files: string[];
  dirs: string[];
  timestamp: number;
}

const fileCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isGitRepo(workingDir: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: workingDir });
    return true;
  } catch {
    return false;
  }
}

const EXCLUDED_DIRS = new Set(['node_modules', '.git']);
const MAX_DEPTH = 5;

/**
 * Cross-platform recursive directory walk using Node.js fs.
 * Collects files and directories up to MAX_DEPTH levels deep, excluding
 * EXCLUDED_DIRS at any level. Returns paths relative to `root` using
 * forward slashes on all platforms.
 */
async function walkDir(
  root: string,
  currentDir: string,
  depth: number,
  files: string[],
  dirs: string[],
): Promise<void> {
  if (depth > MAX_DEPTH) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      // Skip symlinks entirely to avoid infinite loops
      continue;
    }

    const absPath = path.join(currentDir, entry.name);
    // Compute relative path from root and normalise to forward slashes
    const relPath = path.relative(root, absPath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      dirs.push(relPath);
      await walkDir(root, absPath, depth + 1, files, dirs);
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
}

export async function fetchFilesAndDirs(workingDir: string): Promise<{ files: string[]; dirs: string[] }> {
  const cached = fileCache.get(workingDir);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { files: cached.files, dirs: cached.dirs };
  }

  let files: string[] = [];
  let dirs: string[] = [];

  try {
    if (await isGitRepo(workingDir)) {
      // `git ls-files` reports only the gitlink entry (one directory) for a
      // submodule, hiding every file tracked *inside* it — so the `@` picker
      // cannot find files that a repo vendors through submodules.
      // `--recurse-submodules` surfaces them, but git rejects combining it with
      // `--others` ("ls-files --recurse-submodules unsupported mode"), so we run
      // two calls and merge:
      //   1. tracked files, recursing into submodules
      //   2. untracked-but-not-ignored files (top level; --exclude-standard
      //      keeps .gitignore honoured)
      // Issue #201.
      const gitOpts = { cwd: workingDir, maxBuffer: 10 * 1024 * 1024 };
      const [tracked, untracked] = await Promise.all([
        execFileAsync('git', ['ls-files', '--cached', '--recurse-submodules'], gitOpts),
        execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], gitOpts),
      ]);
      const fileSet = new Set<string>();
      for (const stdout of [tracked.stdout, untracked.stdout]) {
        for (const f of stdout.split('\n')) {
          if (f.length > 0) fileSet.add(f);
        }
      }
      files = Array.from(fileSet);

      // Extract unique directories from file paths
      const dirSet = new Set<string>();
      for (const file of files) {
        const parts = file.split('/');
        for (let i = 1; i < parts.length; i++) {
          dirSet.add(parts.slice(0, i).join('/'));
        }
      }
      dirs = Array.from(dirSet);
    } else {
      // Cross-platform: use Node.js fs instead of Unix `find` (Windows compatible)
      await walkDir(workingDir, workingDir, 1, files, dirs);
    }
  } catch {
    // On error, return empty — do not break the service
    files = [];
    dirs = [];
  }

  fileCache.set(workingDir, { files, dirs, timestamp: Date.now() });
  return { files, dirs };
}

// Subsequence + word-boundary (camelCase) fuzzy scorer, fzf/IntelliJ CamelHump style.
const BOUNDARY = /[/_\-. ]/;

/**
 * Scores `target` against `query` as a subsequence match. Returns null when
 * `query` cannot be matched as a subsequence of `target` (i.e. no match).
 * Also returns the target-relative indices of each matched character, in the
 * order the query characters were matched (ascending).
 */
function subsequenceScore(target: string, query: string): { score: number; indices: number[] } | null {
  const t = target;
  const q = query.toLowerCase();
  let ti = 0;
  let s = 0;
  let prev = -1;
  let started = false;
  const indices: number[] = [];
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi];
    let found = -1;
    for (let k = ti; k < t.length; k++) {
      if (t[k].toLowerCase() === ch) {
        found = k;
        break;
      }
    }
    if (found === -1) {
      return null; // subsequence not satisfied -> reject
    }
    indices.push(found);
    if (!started) {
      s += 16; // bonus for match start
      started = true;
    }
    const isUpper = t[found] >= 'A' && t[found] <= 'Z';
    const prevCh = found > 0 ? t[found - 1] : '/';
    const atBoundary = isUpper || BOUNDARY.test(prevCh);
    if (atBoundary) {
      s += 8; // word-boundary (camelCase) bonus -- the key differentiator
    }
    if (found === prev + 1) {
      s += 8; // consecutive match bonus
    }
    if (prev !== -1) {
      s -= found - prev - 1; // gap penalty
    }
    prev = found;
    ti = found + 1;
  }
  return { score: s, indices };
}

/**
 * Scores an item by basename first, falling back to the full relative path.
 * Basename matches get a +20 bonus so files whose own name matches rank
 * above files that merely happen to have a matching directory prefix.
 * Also returns the relativePath-based indices of the winning match (basename
 * indices are offset to account for the directory prefix).
 */
function scoreItem(
  relativePath: string,
  basename: string,
  query: string,
): { score: number; matchIndices: number[] } | null {
  const sb = subsequenceScore(basename, query);
  const sf = subsequenceScore(relativePath, query);

  const basenameScore = sb === null ? null : sb.score + 20;
  const pathScore = sf === null ? null : sf.score;

  if (basenameScore === null && pathScore === null) {
    return null;
  }

  if (pathScore === null || (basenameScore !== null && basenameScore >= pathScore)) {
    // basename match wins (or is the only match) -- offset indices into relativePath
    const offset = relativePath.length - basename.length;
    return { score: basenameScore as number, matchIndices: sb!.indices.map((i) => i + offset) };
  }

  return { score: pathScore, matchIndices: sf!.indices };
}

/**
 * Ranks files and directories against `query` using fuzzy subsequence +
 * word-boundary scoring (fzf/IntelliJ CamelHump style). Empty query returns
 * directories only, matching prior behaviour.
 */
export function rankFiles(files: string[], dirs: string[], query: string, limit: number): FileEntry[] {
  if (query.trim() === '') {
    return dirs.slice(0, limit).map((d) => ({ relativePath: d, type: 'directory' as const }));
  }

  const candidates = [
    ...dirs.map((d) => ({ relativePath: d, type: 'directory' as const })),
    ...files.map((f) => ({ relativePath: f, type: 'file' as const })),
  ];

  const scored = candidates
    .map((item) => {
      const basename = item.relativePath.split('/').pop() ?? item.relativePath;
      const result = scoreItem(item.relativePath, basename, query);
      return result === null ? null : { ...item, score: result.score, matchIndices: result.matchIndices };
    })
    .filter((item): item is FileEntry & { score: number; matchIndices: number[] } => item !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.relativePath.length - b.relativePath.length;
  });

  return scored
    .slice(0, limit)
    .map(({ relativePath, type, matchIndices }) => ({ relativePath, type, matchIndices }));
}

export async function listProjectFilesHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const query = (message.payload?.query as string) ?? '';
  const rawWorkingDir = (message.payload?.workingDir as string) ?? process.cwd();
  // In JetBrains mode a WSL project's backend runs inside the distro
  // (process.platform === 'linux'), but the IDE hands the project root over the
  // wire as a Windows UNC path (`//wsl.localhost/<distro>/...`) that doesn't exist
  // inside the distro. Left as-is, git/fs.readdir hit ENOENT and the `@` mention
  // dropdown silently shows an empty list. Convert it to the inner Linux path —
  // the same resolveWslCwd fix claude.ts/command.ts already apply. A no-op
  // off-linux or for non-UNC paths. Issue #195.
  const workingDir = (resolveWslCwd(rawWorkingDir) as string) ?? rawWorkingDir;
  const limit = (message.payload?.limit as number) ?? 20;

  // If the user configured a `fileSuggestion` command in their Claude settings,
  // defer the `@` index to it exactly as the CLI does (CLI parity): the command
  // gets the query as `{"query":...}` JSON on stdin and prints file paths. On
  // any failure fall through to the built-in index so the picker never silently
  // breaks. Issue #201.
  try {
    const { settings } = await readMergedClaudeSettings(workingDir);
    const suggestion = parseFileSuggestion(settings);
    if (suggestion) {
      try {
        const paths = await runFileSuggestionCommand(
          suggestion.command,
          query,
          workingDir,
          Math.min(limit, FILE_SUGGESTION_RESULT_CAP),
        );
        const files: FileEntry[] = paths.map((p) => ({ relativePath: p, type: 'file' as const }));
        connections.sendTo(connectionId, MessageType.ACK, {
          requestId: message.requestId,
          files,
        });
        return;
      } catch (err) {
        console.error(
          '[node-backend]',
          'fileSuggestion command failed, falling back to built-in index:',
          err,
        );
      }
    }
  } catch {
    // Settings read failed — fall through to the built-in index.
  }

  try {
    const { files, dirs } = await fetchFilesAndDirs(workingDir);
    const result = rankFiles(files, dirs, query, limit);

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      files: result,
    });
  } catch {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      files: [],
    });
  }
}
