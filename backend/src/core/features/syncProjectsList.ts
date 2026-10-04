import { createReadStream } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';
import { EntityChange } from '../entities/AbstractEntityCollection';
import { ProjectCollection } from '../entities/project/Project.collection';
import { Project } from '../entities/project/Project.entity';
import { normalizeCwd } from '../entities/project/normalizeCwd';
import { getClaudeConfigDir } from './claudeConfigDir';
import { getProjectsList, type ProjectListEntry } from './getProjectsList';

/**
 * One working directory as the CLI's records describe it: how many sessions it
 * has, when the newest was written and when the oldest was created.
 *
 * The path is exactly as the CLI recorded it. Settling its spelling is the
 * `projects` table's business, and happens when it is recorded there.
 */
class ScannedProject {
  constructor(
    readonly path: string,
    readonly sessionCount: number,
    /** Epoch milliseconds. */
    readonly lastModified: number,
    /** Epoch milliseconds. */
    readonly createdAt: number,
  ) {}

  /** The same directory as seen through another record: counts add, the times widen. */
  mergedWith(other: ScannedProject): ScannedProject {
    return new ScannedProject(
      this.path,
      this.sessionCount + other.sessionCount,
      Math.max(this.lastModified, other.lastModified),
      Math.min(this.createdAt, other.createdAt),
    );
  }

  /** The same record under another spelling of the path. */
  at(path: string): ScannedProject {
    return new ScannedProject(path, this.sessionCount, this.lastModified, this.createdAt);
  }
}

interface SessionsIndexEntry {
  isSidechain?: boolean;
  projectPath?: string;
  modified?: string;
  created?: string;
}

interface SessionsIndex {
  entries?: SessionsIndexEntry[];
}

interface JsonlEntryWithCwd {
  cwd?: string;
}

/**
 * The working directory recorded in a session transcript, or undefined when the
 * file holds none.
 *
 * Reads until it finds a `cwd`, with no line budget. The field is not near the
 * top of the file: measured over 470 transcripts, the first `cwd` sits at a
 * median byte offset of ~3.28 MB, because the third line of a transcript is
 * routinely a single JSON object several megabytes long. Capping the scan at
 * the first N lines only makes it likelier to come back empty; it does not make
 * it cheaper, since the cost is dominated by reading and parsing that one huge
 * line either way.
 */
function readCwdFromJsonl(filePath: string): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let resolved = false;

    rl.on('line', (line) => {
      // Parsing a multi-megabyte line is the expensive part, so skip lines that
      // cannot carry the field at all.
      if (!line.includes('"cwd"')) return;
      try {
        const parsed = JSON.parse(line) as JsonlEntryWithCwd;
        if (parsed.cwd) {
          resolved = true;
          rl.close();
          stream.destroy();
          resolve(parsed.cwd);
        }
      } catch {
        // malformed line, skip
      }
    });

    rl.once('close', () => {
      if (!resolved) resolve(undefined);
    });

    stream.once('error', reject);
  });
}

/**
 * The project for a transcript folder that has no usable sessions-index.json,
 * resolved without opening every transcript in it.
 *
 * A folder under ~/.claude/projects is named after one working directory, and
 * every transcript inside it records that same directory in its `cwd` field, so
 * one transcript answers the question the whole folder would. The count comes
 * from the number of .jsonl files and the timestamp from their stat mtimes,
 * neither of which requires opening a file.
 *
 * The newest transcript is tried first, and the next one only if that one holds
 * no `cwd` at all. That happens: of 471 transcripts measured, 4 had none, and
 * all four were 267 to 430 byte files from a session that ended before anything
 * was recorded. Falling through them costs nothing because they are tiny.
 *
 * The one thing this gives up is a folder that holds more than one `cwd`, which
 * happens when a project directory is renamed or moved: the folder keeps its
 * name from the new path while older transcripts still record the old one. Only
 * the newest `cwd` survives, and the stale path drops off the list.
 */
async function scanJsonlFolder(folderPath: string): Promise<ScannedProject[]> {
  let files: string[];
  try {
    files = (await readdir(folderPath)).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return [];
  }

  if (files.length === 0) return [];

  // birthtimeMs rides along on the same stat() call already needed for
  // mtimeMs, so tracking "created" costs nothing extra here. Some filesystems
  // report 0 for it (birthtime unsupported); mtime is the fallback for those,
  // since a missing creation time is a worse answer than an approximate one.
  const stated = (
    await Promise.all(
      files.map(async (file) => {
        try {
          const { mtimeMs, birthtimeMs } = await stat(join(folderPath, file));
          return { file, mtimeMs, birthtimeMs: birthtimeMs || mtimeMs };
        } catch {
          return null;
        }
      }),
    )
  ).filter(
    (entry): entry is { file: string; mtimeMs: number; birthtimeMs: number } => entry !== null,
  );

  if (stated.length === 0) return [];

  stated.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const createdAtMs = Math.min(...stated.map((entry) => entry.birthtimeMs));

  let projectPath: string | undefined;
  for (const { file } of stated) {
    try {
      projectPath = await readCwdFromJsonl(join(folderPath, file));
    } catch {
      // unreadable transcript, try the next one
    }
    if (projectPath) break;
  }

  if (!projectPath) return [];

  return [new ScannedProject(projectPath, stated.length, stated[0].mtimeMs, createdAtMs)];
}

/** A time from a sessions-index entry in epoch milliseconds, or [fallback] when it is missing or not a date. */
function timeOf(text: string | undefined, fallback: number): number {
  if (!text) return fallback;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Every working directory the CLI has records of, as the CLI recorded it. */
async function scanClaudeProjects(): Promise<ScannedProject[]> {
  try {
    const projectsDir = join(getClaudeConfigDir(), 'projects');
    const entries = await readdir(projectsDir, { withFileTypes: true });

    const scanned: ScannedProject[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.')) continue;

      const folderPath = join(projectsDir, entry.name);
      const indexPath = join(folderPath, 'sessions-index.json');

      let parsed: SessionsIndex | null = null;
      try {
        const indexContent = await readFile(indexPath, 'utf-8');
        parsed = JSON.parse(indexContent) as SessionsIndex;
      } catch {
        // No sessions-index.json: fall back to the transcripts.
      }

      if (parsed === null) {
        scanned.push(...(await scanJsonlFolder(folderPath)));
        continue;
      }

      // A readable sessions-index.json: group its entries by projectPath.
      const validEntries = (parsed.entries ?? []).filter((e) => !e.isSidechain);
      if (validEntries.length === 0) {
        // No usable entries: fall back to the transcripts.
        scanned.push(...(await scanJsonlFolder(folderPath)));
        continue;
      }

      // Per projectPath: a count, the newest `modified` and the oldest `created`.
      // The two answer different questions. "Recent" order needs the maximum of
      // modified and "created" order needs the minimum of created. An entry that
      // lacks one of them uses the other.
      const grouped = new Map<string, ScannedProject>();
      for (const e of validEntries) {
        const projectPath = e.projectPath;
        if (!projectPath) continue;

        const modifiedTs = timeOf(e.modified, timeOf(e.created, Date.now()));
        const createdTs = timeOf(e.created, modifiedTs);

        const seen = new ScannedProject(projectPath, 1, modifiedTs, createdTs);
        const existing = grouped.get(projectPath);
        grouped.set(projectPath, existing ? existing.mergedWith(seen) : seen);
      }

      if (grouped.size === 0) {
        // Only entries without a projectPath: fall back to the transcripts.
        scanned.push(...(await scanJsonlFolder(folderPath)));
        continue;
      }
      scanned.push(...grouped.values());
    }

    return scanned;
  } catch (err) {
    console.error('[node-backend]', 'Error reading projects list:', err);
    return [];
  }
}

/**
 * Bring the `projects` table in line with what the CLI has recorded: register a
 * directory the table has not seen, and refresh the counts and times of the ones
 * it has.
 *
 * With [pruneUnseen] a project the CLI no longer has any record of gets a session
 * count of 0, which is what a project whose sessions were all deleted looks like.
 * That is only right when the scan covered the profile that holds every project;
 * a scan of one project's own profile sees only a part of them, and must not
 * zero the rest.
 *
 * A project the user removed from the list is listed again once a session newer
 * than the removal turns up.
 */
async function recordScan(scanned: ScannedProject[], pruneUnseen: boolean): Promise<void> {
  const byPath = new Map<string, ScannedProject>();
  for (const project of scanned) {
    let path: string;
    try {
      path = normalizeCwd(project.path);
    } catch (err) {
      // A directory that is not an absolute path here (another platform's) has no
      // spelling the table could settle on.
      console.error('[node-backend]', `Skipping project ${project.path}:`, err instanceof Error ? err.message : err);
      continue;
    }
    const merged = byPath.get(path);
    byPath.set(path, merged ? merged.mergedWith(project.at(path)) : project.at(path));
  }

  const projects = new ProjectCollection();
  const known = new Set((await projects.all()).map((project) => project.path));
  const unregistered = [...byPath.values()].filter((project) => !known.has(project.path));
  if (unregistered.length > 0) {
    await projects.insertMissing(
      unregistered.map(
        (seen) => new Project(0, null, seen.path, seen.sessionCount, seen.lastModified, seen.createdAt, 0, null, null, 0),
      ),
      (stored, candidate) => stored.path === candidate.path,
    );
  }

  await projects.mutate((rows) => {
    let changed = false;
    for (const row of rows) {
      const seen = byPath.get(row.path);
      if (seen === undefined) {
        if (pruneUnseen && row.sessionCount !== 0) {
          row.sessionCount = 0;
          changed = true;
        }
        continue;
      }
      const hiddenAt = row.isHidden && seen.lastModified > row.hiddenAt ? 0 : row.hiddenAt;
      if (
        row.sessionCount !== seen.sessionCount ||
        row.lastModified !== seen.lastModified ||
        row.createdAt !== seen.createdAt ||
        row.hiddenAt !== hiddenAt
      ) {
        row.sessionCount = seen.sessionCount;
        row.lastModified = seen.lastModified;
        row.createdAt = seen.createdAt;
        row.hiddenAt = hiddenAt;
        changed = true;
      }
    }
    return changed ? EntityChange.write(rows, undefined) : EntityChange.keep(rows, undefined);
  });
}

/**
 * Read the CLI's records of every working directory, bring the `projects` table up
 * to date with them, and answer the list.
 *
 * The CLI's records are the ground truth for which directories have sessions; the
 * table adds the directories the program was asked about that have none. The list
 * the project picker shows is the table's, so this runs whenever that picker (or
 * anything that must see a directory made in a terminal a moment ago) is opened.
 */
export async function syncProjectsList(pruneUnseen = false): Promise<ProjectListEntry[]> {
  await recordScan(await scanClaudeProjects(), pruneUnseen);
  return getProjectsList();
}
