import { createReadStream } from 'fs';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { createInterface } from 'readline';
import { workingDirName } from '../../shared';
import { getClaudeConfigDir } from './claudeConfigDir';

interface ProjectEntry {
  name: string;       // 폴더 이름 (프로젝트 이름)
  path: string;       // 전체 경로 (워킹 디렉토리)
  sessionCount: number;
  /** Most recent activity — the newest session's last write. Drives "recent" order. */
  lastModified: string;
  /** Earliest known session for this project. Drives "created" order (#392). */
  createdAt: string;
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
 * The project entry for a transcript folder that has no usable
 * sessions-index.json, resolved without opening every transcript in it.
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
async function buildEntriesFromJsonl(folderPath: string): Promise<ProjectEntry[]> {
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

  return [
    {
      name: workingDirName(projectPath),
      path: projectPath,
      sessionCount: stated.length,
      lastModified: new Date(stated[0].mtimeMs).toISOString(),
      createdAt: new Date(createdAtMs).toISOString(),
    },
  ];
}

export async function getProjectsList(): Promise<ProjectEntry[]> {
  try {
    const projectsDir = join(getClaudeConfigDir(), 'projects');
    const entries = await readdir(projectsDir, { withFileTypes: true });

    const projects: ProjectEntry[] = [];

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
        // sessions-index.json 없음 → JSONL fallback으로 처리
      }

      if (parsed !== null) {
        // sessions-index.json 파싱 성공 → projectPath 기준으로 group by
        const validEntries = (parsed.entries ?? []).filter((e) => !e.isSidechain);

        if (validEntries.length === 0) {
          // 유효 엔트리 없음 → JSONL fallback 시도
          const fallback = await buildEntriesFromJsonl(folderPath);
          projects.push(...fallback);
          continue;
        }

        // projectPath → { count, lastModified, createdAt } 집계.
        // modified와 created는 서로 다른 질문에 답한다 — 최근순은 최댓값(modified),
        // 생성순은 최솟값(created)이 필요하다. 어느 한쪽이 없는 엔트리는
        // 있는 값으로 대체한다.
        const grouped = new Map<string, { count: number; lastModified: number; createdAt: number }>();
        for (const e of validEntries) {
          const projectPath = e.projectPath;
          if (!projectPath) continue;

          const modifiedTs = e.modified
            ? new Date(e.modified).getTime()
            : e.created
              ? new Date(e.created).getTime()
              : Date.now();
          const createdTs = e.created ? new Date(e.created).getTime() : modifiedTs;

          const existing = grouped.get(projectPath);
          if (existing) {
            existing.count += 1;
            if (modifiedTs > existing.lastModified) existing.lastModified = modifiedTs;
            if (createdTs < existing.createdAt) existing.createdAt = createdTs;
          } else {
            grouped.set(projectPath, { count: 1, lastModified: modifiedTs, createdAt: createdTs });
          }
        }

        if (grouped.size === 0) {
          // projectPath가 없는 엔트리만 있었던 경우 → JSONL fallback
          const fallback = await buildEntriesFromJsonl(folderPath);
          projects.push(...fallback);
          continue;
        }

        for (const [projectPath, { count, lastModified, createdAt }] of grouped.entries()) {
          projects.push({
            name: workingDirName(projectPath),
            path: projectPath,
            sessionCount: count,
            lastModified: new Date(lastModified).toISOString(),
            createdAt: new Date(createdAt).toISOString(),
          });
        }
      } else {
        // sessions-index.json 없음 → JSONL fallback
        const fallback = await buildEntriesFromJsonl(folderPath);
        if (fallback.length === 0) continue; // 실제 세션 없음 → skip
        projects.push(...fallback);
      }
    }

    // lastModified 내림차순 정렬
    projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

    return projects;
  } catch (err) {
    console.error('[node-backend]', 'Error reading projects list:', err);
    return [];
  }
}
