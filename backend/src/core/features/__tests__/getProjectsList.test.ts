import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getProjectsList } from '../getProjectsList';

/**
 * Resolving a project costs one transcript, not the whole folder.
 *
 * The folder under ~/.claude/projects is named after a working directory whose
 * `/` and `_` were both flattened to `-`, so the name cannot be decoded back
 * into a path and the `cwd` field inside a transcript is the only answer. The
 * question is how many transcripts have to be opened to get it, and on a real
 * profile the old answer (all of them) took ~2.5s for 29 projects (#392).
 */
describe('getProjectsList', () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  let configDir: string;
  let projectsDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'ccg-projects-list-'));
    projectsDir = join(configDir, 'projects');
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = configDir;
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  });

  /** Write a transcript and pin its mtime, since selection is by mtime. */
  function writeTranscript(
    folder: string,
    name: string,
    lines: unknown[],
    mtimeSeconds: number,
  ): string {
    const folderPath = join(projectsDir, folder);
    mkdirSync(folderPath, { recursive: true });
    const filePath = join(folderPath, name);
    writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n'));
    utimesSync(filePath, mtimeSeconds, mtimeSeconds);
    return filePath;
  }

  it('finds a cwd that sits far past the first ten lines', async () => {
    // On real transcripts the first `cwd` lands at a median offset of ~3.28 MB,
    // well past any fixed line budget. A budget only makes the lookup fail; it
    // does not make it cheap, because the cost is the one huge line either way.
    const lines: unknown[] = Array.from({ length: 40 }, (_, i) => ({ type: 'meta', seq: i }));
    lines.push({ type: 'user', cwd: '/home/user/deep-project' });
    writeTranscript('-home-user-deep-project', 'a.jsonl', lines, 1_700_000_000);

    const projects = await getProjectsList();

    expect(projects).toHaveLength(1);
    expect(projects[0].path).toBe('/home/user/deep-project');
    expect(projects[0].name).toBe('deep-project');
  });

  it('reads only the newest transcript, leaving the rest unopened', async () => {
    // Every transcript in a folder records the same working directory, so the
    // older ones hold no new information. Giving them a different cwd here is
    // the probe: if any of them were opened, that cwd would reach the result.
    writeTranscript(
      '-home-user-app',
      'old.jsonl',
      [{ type: 'user', cwd: '/home/user/app-OLD-PATH' }],
      1_700_000_000,
    );
    writeTranscript(
      '-home-user-app',
      'newest.jsonl',
      [{ type: 'user', cwd: '/home/user/app' }],
      1_800_000_000,
    );

    const projects = await getProjectsList();

    expect(projects.map((p) => p.path)).toEqual(['/home/user/app']);
  });

  it('falls through to the next transcript when the newest holds no cwd', async () => {
    // Sessions that end before anything is recorded leave a file of a few
    // hundred bytes with no cwd in it: 4 of 471 transcripts measured on a real
    // profile. They are tiny, so falling through them costs nothing.
    writeTranscript(
      '-home-user-app',
      'has-cwd.jsonl',
      [{ type: 'user', cwd: '/home/user/app' }],
      1_700_000_000,
    );
    writeTranscript('-home-user-app', 'empty.jsonl', [{ type: 'summary' }], 1_800_000_000);

    const projects = await getProjectsList();

    expect(projects.map((p) => p.path)).toEqual(['/home/user/app']);
  });

  it('counts sessions by transcript file, including ones with no cwd', async () => {
    writeTranscript(
      '-home-user-app',
      'a.jsonl',
      [{ type: 'user', cwd: '/home/user/app' }],
      1_800_000_000,
    );
    writeTranscript(
      '-home-user-app',
      'b.jsonl',
      [{ type: 'user', cwd: '/home/user/app' }],
      1_700_000_000,
    );
    writeTranscript('-home-user-app', 'c.jsonl', [{ type: 'summary' }], 1_600_000_000);
    writeFileSync(join(projectsDir, '-home-user-app', 'notes.txt'), 'not a transcript');

    const projects = await getProjectsList();

    expect(projects[0].sessionCount).toBe(3);
  });

  it('takes lastModified from the newest transcript mtime', async () => {
    writeTranscript(
      '-home-user-app',
      'old.jsonl',
      [{ type: 'user', cwd: '/home/user/app' }],
      1_700_000_000,
    );
    writeTranscript(
      '-home-user-app',
      'new.jsonl',
      [{ type: 'user', cwd: '/home/user/app' }],
      1_800_000_000,
    );

    const projects = await getProjectsList();

    expect(projects[0].lastModified).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('skips a folder whose transcripts hold no cwd at all', async () => {
    writeTranscript('-home-user-ghost', 'a.jsonl', [{ type: 'summary' }], 1_700_000_000);

    const projects = await getProjectsList();

    expect(projects).toEqual([]);
  });

  it('sorts projects by lastModified, newest first', async () => {
    writeTranscript(
      '-home-user-older',
      'a.jsonl',
      [{ type: 'user', cwd: '/home/user/older' }],
      1_700_000_000,
    );
    writeTranscript(
      '-home-user-newer',
      'a.jsonl',
      [{ type: 'user', cwd: '/home/user/newer' }],
      1_900_000_000,
    );

    const projects = await getProjectsList();

    expect(projects.map((p) => p.path)).toEqual(['/home/user/newer', '/home/user/older']);
  });

  it('still prefers sessions-index.json when the folder has one', async () => {
    const folderPath = join(projectsDir, '-home-user-indexed');
    mkdirSync(folderPath, { recursive: true });
    writeFileSync(
      join(folderPath, 'sessions-index.json'),
      JSON.stringify({
        entries: [
          { projectPath: '/home/user/indexed', modified: '2026-01-02T00:00:00.000Z' },
          { projectPath: '/home/user/indexed', modified: '2026-01-03T00:00:00.000Z' },
          { projectPath: '/home/user/indexed', modified: '2026-01-04T00:00:00.000Z', isSidechain: true },
        ],
      }),
    );
    // A transcript with a conflicting cwd proves the index path was taken.
    writeTranscript(
      '-home-user-indexed',
      'a.jsonl',
      [{ type: 'user', cwd: '/home/user/FROM-TRANSCRIPT' }],
      1_900_000_000,
    );

    const projects = await getProjectsList();

    expect(projects).toHaveLength(1);
    expect(projects[0].path).toBe('/home/user/indexed');
    expect(projects[0].sessionCount).toBe(2);
    expect(projects[0].lastModified).toBe('2026-01-03T00:00:00.000Z');
  });

  // A working directory reaches us as the CLI recorded it, so on Windows it is
  // backslash-separated — `shared/working-dir-path` says so about these exact
  // two fields. Splitting such a path on `/` yields the whole string, which put
  // `C:\Users\me\my-app` in the project list where the folder name belongs.
  describe('a Windows working directory', () => {
    it('takes its name from the last segment in the JSONL-fallback path', async () => {
      writeTranscript(
        'C--Users-me-my-app',
        'a.jsonl',
        [{ type: 'user', cwd: 'C:\\Users\\me\\my-app' }],
        1_700_000_000,
      );

      const projects = await getProjectsList();

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe('C:\\Users\\me\\my-app');
      expect(projects[0].name).toBe('my-app');
    });

    it('takes its name from the last segment in the sessions-index path', async () => {
      const folderPath = join(projectsDir, 'C--Users-me-indexed-app');
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        join(folderPath, 'sessions-index.json'),
        JSON.stringify({
          entries: [
            { projectPath: 'C:\\Users\\me\\indexed-app', modified: '2026-01-02T00:00:00.000Z' },
          ],
        }),
      );

      const projects = await getProjectsList();

      expect(projects).toHaveLength(1);
      expect(projects[0].path).toBe('C:\\Users\\me\\indexed-app');
      expect(projects[0].name).toBe('indexed-app');
    });
  });

  // "Recent" and "created" order (#392) need genuinely different timestamps:
  // recent is the newest activity, created is the earliest.
  describe('createdAt', () => {
    it('takes the earliest transcript file birthtime in the JSONL-fallback path', async () => {
      // birthtime cannot be forced via utimesSync (it only sets atime/mtime),
      // so this asserts against the real on-disk birthtime rather than a value
      // chosen by the test — the point being verified is "the minimum of the
      // actual filesystem birthtimes", not a specific number.
      const first = writeTranscript(
        '-home-user-app',
        'a.jsonl',
        [{ type: 'user', cwd: '/home/user/app' }],
        1_700_000_000,
      );
      writeTranscript(
        '-home-user-app',
        'b.jsonl',
        [{ type: 'user', cwd: '/home/user/app' }],
        1_800_000_000,
      );

      const projects = await getProjectsList();

      const firstBirthtime = statSync(first).birthtime.toISOString();
      expect(projects[0].createdAt).toBe(firstBirthtime);
    });

    it('differs from lastModified, so the two sort orders can disagree', async () => {
      writeTranscript(
        '-home-user-app',
        'old.jsonl',
        [{ type: 'user', cwd: '/home/user/app' }],
        1_700_000_000,
      );
      writeTranscript(
        '-home-user-app',
        'new.jsonl',
        [{ type: 'user', cwd: '/home/user/app' }],
        1_900_000_000,
      );

      const projects = await getProjectsList();

      expect(projects[0].lastModified).toBe(new Date(1_900_000_000 * 1000).toISOString());
      expect(projects[0].createdAt).not.toBe(projects[0].lastModified);
    });

    it('takes the minimum created and the maximum modified across sessions-index entries', async () => {
      const folderPath = join(projectsDir, '-home-user-indexed');
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        join(folderPath, 'sessions-index.json'),
        JSON.stringify({
          entries: [
            {
              projectPath: '/home/user/indexed',
              created: '2026-01-05T00:00:00.000Z',
              modified: '2026-01-06T00:00:00.000Z',
            },
            {
              projectPath: '/home/user/indexed',
              created: '2026-01-01T00:00:00.000Z',
              modified: '2026-01-02T00:00:00.000Z',
            },
          ],
        }),
      );

      const projects = await getProjectsList();

      expect(projects[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(projects[0].lastModified).toBe('2026-01-06T00:00:00.000Z');
    });

    it('falls back to modified when an index entry has no created field', async () => {
      const folderPath = join(projectsDir, '-home-user-indexed');
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        join(folderPath, 'sessions-index.json'),
        JSON.stringify({
          entries: [{ projectPath: '/home/user/indexed', modified: '2026-01-02T00:00:00.000Z' }],
        }),
      );

      const projects = await getProjectsList();

      expect(projects[0].createdAt).toBe('2026-01-02T00:00:00.000Z');
    });

    it('falls back to created when an index entry has no modified field', async () => {
      const folderPath = join(projectsDir, '-home-user-indexed');
      mkdirSync(folderPath, { recursive: true });
      writeFileSync(
        join(folderPath, 'sessions-index.json'),
        JSON.stringify({
          entries: [{ projectPath: '/home/user/indexed', created: '2026-01-01T00:00:00.000Z' }],
        }),
      );

      const projects = await getProjectsList();

      expect(projects[0].lastModified).toBe('2026-01-01T00:00:00.000Z');
    });
  });
});
