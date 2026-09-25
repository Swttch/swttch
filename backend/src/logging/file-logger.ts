import { stat, readdir, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { createStream, type RotatingFileStream } from 'rotating-file-stream';

const MAX_FILE_SIZE_MB = 50;

/**
 * How much of the user's disk the whole log directory may hold.
 *
 * This was 2 GB, and a developer machine reached it: 2.0 GB across 20 archives,
 * the oldest 11 days back (issue #477). The reporter hit 952 MB and assumed there
 * was no cap at all. With the per-token lines moved to DEBUG and archives gzipped,
 * the directory grows a small fraction of what it used to, so 512 MB still holds
 * many days of ordinary use while being a size a user would not notice.
 */
const MAX_TOTAL_SIZE = 512 * 1024 * 1024; // 512MB

/**
 * How many log files the directory may hold, whatever their size.
 *
 * One active file per process means a new file on every backend start, and a
 * backend starts every time the IDE opens or the dev server reloads. Those files
 * are individually tiny, so a size cap alone would never reach them: a few hundred
 * 1 KB files sit far below 512 MB and would stay on disk forever. Forty is a few
 * weeks of ordinary restarts, and still small enough that listing the directory
 * stays quick.
 */
const MAX_FILE_COUNT = 40;

/**
 * Where logs live.
 *
 * `CCG_HOME` is honored because it is the documented override for the user-data
 * directory (`cli/install.sh`). This module used to ignore it and always write
 * under the real home, which meant a test could write into the developer's own
 * `~/.claude-code-gui/logs/`. Read on each call rather than captured at import,
 * so a test can set it after this module is loaded.
 */
function defaultLogDir(): string {
  const home = process.env.CCG_HOME?.trim();
  return home ? join(home, 'logs') : join(homedir(), '.claude-code-gui', 'logs');
}

/**
 * Matches anything this logger has ever produced: the old shared `server.log`,
 * the old `server-<timestamp>.log` archives, and both of the current per-process
 * names, compressed or not. Used to decide what the cap may delete, so it must
 * still recognise files written by earlier versions — otherwise the 2 GB a user
 * already has on disk would never be reclaimed.
 */
const ANY_LOG_FILE = /^server(-.+)?\.log(\.gz)?$/;

/**
 * One active file per process.
 *
 * Three different backends run against the same log directory on a developer
 * machine — the `ccg` standalone runtime, a worktree dev server, and the backend
 * the JetBrains plugin spawns — and they all used to append to a single
 * `server.log`. Two failures followed from that, both measured in issue #477:
 *
 * 1. The byte count lives in one process's memory, so nobody could see what the
 *    others had written. Three processes writing 30 MB each left a 90 MB file
 *    that none of them considered over the 50 MB limit.
 * 2. Worse, rotation renames the file others still hold open. Their descriptors
 *    follow the rename, so they keep appending to what is now an *archive* — and
 *    archives are never rotated, so that file grows without any limit at all.
 *    Two processes were caught sharing one archive, and the largest file on disk
 *    had reached 148 MB against a 50 MB cap.
 *
 * Naming the active file after the pid removes both: each process owns its file,
 * so its own byte count is the truth, and no rename ever moves a file another
 * process is writing to. No log library solves this for us — it is a consequence
 * of how many backends we run, not of how one of them writes.
 */
function activeFileName(pid: number): string {
  return `server-${pid}.log`;
}

/**
 * Size limits, overridable so a test can exercise rotation and the cap without
 * writing 50 MB to disk to do it.
 */
export interface FileLoggerLimits {
  /** Rotation threshold, in the library's size syntax (e.g. '50M', '4K'). */
  maxFileSize?: string;
  maxTotalSize?: number;
  maxFileCount?: number;
  /** Gzip rotated archives. On by default; a test turns it off to compare sizes. */
  compress?: boolean;
}

/**
 * Writes the log file, rotates it, and keeps the directory within budget.
 *
 * Rotation and compression are delegated to `rotating-file-stream`, which
 * describes itself as a logrotate alternative. We used to implement that
 * ourselves and it cost us: issue #477 turned up a rotation that let a buffered
 * burst leave the fresh file already over the limit, with nothing left to trigger
 * another rotation. Watching a file's size, renaming it, reopening, and gzipping
 * is solved work, and none of it is specific to this product.
 *
 * What stays ours is what the library cannot know about: that several backends
 * share one directory (hence the pid in the name), that `CCG_HOME` may move it,
 * and that files left by *other* processes and by earlier versions still have to
 * be swept. The library's own `maxFiles`/`maxSize` only ever consider the files
 * one stream created, so they are deliberately not used.
 */
export class FileLogger {
  private readonly logDirOverride: string | undefined;
  private readonly maxFileSize: string;
  private readonly maxTotalSize: number;
  private readonly maxFileCount: number;
  private readonly compress: boolean;
  private logDir: string = '';
  private activeFile: string = '';
  private stream: RotatingFileStream | null = null;

  constructor(logDir?: string, limits?: FileLoggerLimits) {
    this.logDirOverride = logDir;
    this.maxFileSize = limits?.maxFileSize ?? `${MAX_FILE_SIZE_MB}M`;
    this.maxTotalSize = limits?.maxTotalSize ?? MAX_TOTAL_SIZE;
    this.maxFileCount = limits?.maxFileCount ?? MAX_FILE_COUNT;
    this.compress = limits?.compress ?? true;
  }

  async init(): Promise<void> {
    // Resolved here rather than in the constructor so `CCG_HOME` is read as late
    // as possible — a test that sets it after constructing the logger still wins.
    this.logDir = this.logDirOverride ?? defaultLogDir();
    const pid = process.pid;
    this.activeFile = activeFileName(pid);

    await mkdir(this.logDir, { recursive: true });

    this.stream = createStream(
      // The library calls this with a falsy time for the file being written to,
      // and with a rotation time for each archive. `index` distinguishes two
      // rotations that land in the same second.
      (time: number | Date, index?: number): string => {
        if (!time) return activeFileName(pid);
        const stamp = new Date(time).toISOString().replace(/[:.]/g, '');
        const suffix = index && index > 1 ? `-${index}` : '';
        // The library writes gzip content under whatever name this returns and
        // does not append `.gz` itself, so the extension has to be ours or the
        // archives end up compressed while claiming to be plain text.
        const ext = this.compress ? '.log.gz' : '.log';
        return `server-${pid}-${stamp}${suffix}${ext}`;
      },
      {
        path: this.logDir,
        size: this.maxFileSize,
        compress: this.compress ? 'gzip' : false,
        encoding: 'utf8',
      },
    );

    // A logger that cannot write must not take the backend down with it.
    this.stream.on('error', (err) => {
      console.error('[FileLogger] write failed:', err);
    });
    this.stream.on('warning', (err) => {
      console.error('[FileLogger] warning:', err);
    });

    // Sweep after each rotation, and once at startup.
    //
    // Startup matters on its own: rotation is the only other trigger, and now
    // that the per-token lines are gone the active file may never reach 50 MB.
    // A sweep that only runs on rotation would then never run at all, leaving the
    // leftovers from every previous backend start to pile up untouched.
    this.stream.on('rotated', () => {
      void this.enforceCapLimit();
    });
    await this.enforceCapLimit();
  }

  write(line: string): void {
    this.stream?.write(line);
  }

  /**
   * Delete oldest-first until the directory is back under both caps.
   *
   * Counts *every* log file, including this process's active one and files left
   * behind by other processes and by earlier versions, because all of them sit on
   * the user's disk. Deletion order is by modification time rather than by
   * filename: with a pid in the name, sorting by filename orders by process id,
   * which has nothing to do with age.
   *
   * This process's own active file is never a deletion candidate. Another
   * process's active file can be, and deleting a file that is still open does not
   * free the space until that process exits — but its recent mtime puts it at the
   * end of the queue, so it is only reached when nothing older is left.
   */
  private async enforceCapLimit(): Promise<void> {
    try {
      const entries = await readdir(this.logDir);
      const candidates: Array<{ name: string; size: number; mtimeMs: number }> = [];
      let totalSize = 0;

      for (const name of entries) {
        if (!ANY_LOG_FILE.test(name)) continue;
        try {
          const fileStat = await stat(join(this.logDir, name));
          totalSize += fileStat.size;
          if (name === this.activeFile) continue;
          candidates.push({ name, size: fileStat.size, mtimeMs: fileStat.mtimeMs });
        } catch {
          // Vanished between readdir and stat, or unreadable — skip it.
        }
      }

      candidates.sort((a, b) => a.mtimeMs - b.mtimeMs);

      // +1 for this process's active file, which is excluded from the candidates
      // but still occupies one of the allowed slots.
      let fileCount = candidates.length + 1;

      for (const candidate of candidates) {
        if (totalSize <= this.maxTotalSize && fileCount <= this.maxFileCount) break;
        try {
          await unlink(join(this.logDir, candidate.name));
          totalSize -= candidate.size;
          fileCount -= 1;
        } catch (err) {
          console.error(`[FileLogger] failed to delete an archive (${candidate.name}):`, err);
        }
      }
    } catch (err) {
      console.error('[FileLogger] failed to enforce the size cap:', err);
    }
  }

  close(): Promise<void> {
    return new Promise<void>((resolve) => {
      const stream = this.stream;
      if (!stream) {
        resolve();
        return;
      }
      this.stream = null;
      stream.end(() => resolve());
    });
  }
}
