import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { fetchFilesAndDirs, listProjectFilesHandler, rankFiles } from '../listProjectFiles';
import type { ConnectionManager } from '../../../ws/connection-manager';
import type { Bridge } from '../../../bridge/bridge-interface';
import type { IPCMessage } from '../../types';
import { MessageType } from '../../../shared';

// Helper: create a directory tree under a temp root
// Structure:
//   <root>/
//     file-root.txt
//     subdir/
//       file-sub.ts
//       deeper/
//         file-deep.js
//           level3/
//             file-l3.txt
//               level4/
//                 file-l4.txt
//                   level5/
//                     file-l5.txt
//                       level6/          ← depth 6 from root, must be excluded
//                         file-l6.txt
//     node_modules/                      ← must be excluded entirely
//       some-pkg/
//         index.js
//     .git/                              ← must be excluded entirely
//       HEAD
//     empty-dir/

function buildFileTree(root: string): void {
  const mk = (rel: string) => {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, '');
  };
  const mkdir = (rel: string) => fs.mkdirSync(path.join(root, rel), { recursive: true });

  mk('file-root.txt');
  mk('subdir/file-sub.ts');
  mk('subdir/deeper/file-deep.js');
  mk('subdir/deeper/level3/file-l3.txt');
  mk('subdir/deeper/level3/level4/file-l4.txt');
  mk('subdir/deeper/level3/level4/level5/file-l5.txt');
  // depth-6 file — should NOT appear
  mk('subdir/deeper/level3/level4/level5/level6/file-l6.txt');

  // excluded directories
  mk('node_modules/some-pkg/index.js');
  mk('.git/HEAD');

  // empty dir
  mkdir('empty-dir');
}

let tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'listProjectFiles-test-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const d of tmpDirs) {
    fs.rmSync(d, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe('fetchFilesAndDirs (non-git directory)', () => {
  it('collects files and dirs up to maxdepth 5 (matching Unix find -maxdepth 5 semantics)', async () => {
    const root = makeTmpDir();
    buildFileTree(root);

    const { files, dirs } = await fetchFilesAndDirs(root);

    // find -maxdepth 5 counts depth from the root itself (root = depth 0):
    //   depth 1: file-root.txt, subdir/
    //   depth 2: subdir/file-sub.ts, subdir/deeper/
    //   depth 3: subdir/deeper/file-deep.js, subdir/deeper/level3/
    //   depth 4: subdir/deeper/level3/file-l3.txt, subdir/deeper/level3/level4/
    //   depth 5: subdir/deeper/level3/level4/file-l4.txt  ← last included
    //   depth 6: subdir/deeper/level3/level4/level5/...   ← excluded

    expect(files).toContain('file-root.txt');                             // depth 1
    expect(files).toContain('subdir/file-sub.ts');                        // depth 2
    expect(files).toContain('subdir/deeper/file-deep.js');                // depth 3
    expect(files).toContain('subdir/deeper/level3/file-l3.txt');          // depth 4
    expect(files).toContain('subdir/deeper/level3/level4/file-l4.txt');   // depth 5 — included

    // depth 6 and beyond must NOT appear
    expect(files).not.toContain('subdir/deeper/level3/level4/level5/file-l5.txt');
    expect(files).not.toContain('subdir/deeper/level3/level4/level5/level6/file-l6.txt');
  });

  it('excludes node_modules directory and its contents', async () => {
    const root = makeTmpDir();
    buildFileTree(root);

    const { files, dirs } = await fetchFilesAndDirs(root);

    // No files inside node_modules
    const nmFiles = files.filter((f) => f.startsWith('node_modules'));
    expect(nmFiles).toHaveLength(0);

    // node_modules itself should not appear in dirs
    const nmDirs = dirs.filter((d) => d === 'node_modules' || d.startsWith('node_modules/'));
    expect(nmDirs).toHaveLength(0);
  });

  it('excludes .git directory and its contents', async () => {
    const root = makeTmpDir();
    buildFileTree(root);

    const { files, dirs } = await fetchFilesAndDirs(root);

    const gitFiles = files.filter((f) => f.startsWith('.git'));
    expect(gitFiles).toHaveLength(0);

    const gitDirs = dirs.filter((d) => d === '.git' || d.startsWith('.git/'));
    expect(gitDirs).toHaveLength(0);
  });

  it('returns relative paths with forward slashes (cross-platform)', async () => {
    const root = makeTmpDir();
    buildFileTree(root);

    const { files, dirs } = await fetchFilesAndDirs(root);

    for (const f of files) {
      expect(f).not.toMatch(/\\/); // no backslashes
    }
    for (const d of dirs) {
      expect(d).not.toMatch(/\\/);
    }
  });

  it('paths do not start with ./ prefix', async () => {
    const root = makeTmpDir();
    buildFileTree(root);

    const { files, dirs } = await fetchFilesAndDirs(root);

    for (const f of files) {
      expect(f).not.toMatch(/^\.\//);
    }
    for (const d of dirs) {
      expect(d).not.toMatch(/^\.\//);
    }
  });

  it('directories list contains traversed subdirs', async () => {
    const root = makeTmpDir();
    buildFileTree(root);

    const { dirs } = await fetchFilesAndDirs(root);

    expect(dirs).toContain('subdir');
    expect(dirs).toContain('subdir/deeper');
    expect(dirs).toContain('empty-dir');
  });

  it('returns empty lists when directory is empty', async () => {
    const root = makeTmpDir();

    const { files, dirs } = await fetchFilesAndDirs(root);

    expect(files).toHaveLength(0);
    expect(dirs).toHaveLength(0);
  });

  it('does not throw when the working directory does not exist — falls back to empty', async () => {
    const nonExistent = path.join(os.tmpdir(), 'this-path-does-not-exist-listpf-test');

    const { files, dirs } = await fetchFilesAndDirs(nonExistent);

    expect(files).toHaveLength(0);
    expect(dirs).toHaveLength(0);
  });
});

// `git ls-files` in its default form only reports the gitlink entry for a
// submodule (a single directory), never the files tracked *inside* it — so the
// `@` mention picker cannot find e.g. `Assets/GameFramework/Editor/Foo.asmdef`
// in a repo that vendors code through submodules. `--recurse-submodules` fixes
// this but is mutually exclusive with `--others` ("unsupported mode"), so the
// handler must issue two calls and merge. Issue #201.
//
// These tests shell out to real `git`, so skip where git is unavailable.
function hasGit(): boolean {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
const describeGit = hasGit() ? describe : describe.skip;

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

// Build a parent repo that vendors a submodule at Assets/GameFramework, plus an
// untracked and a gitignored file at the top level, mirroring the reporter's setup.
function makeGitRepoWithSubmodule(): { root: string } {
  const subRoot = makeTmpDir();
  git(subRoot, ['init', '-q']);
  git(subRoot, ['config', 'user.email', 'test@example.com']);
  git(subRoot, ['config', 'user.name', 'test']);
  fs.mkdirSync(path.join(subRoot, 'Editor'), { recursive: true });
  fs.writeFileSync(path.join(subRoot, 'Editor', 'Framework.Editor.asmdef'), '');
  fs.writeFileSync(path.join(subRoot, 'tracked-in-sub.txt'), '');
  git(subRoot, ['add', '-A']);
  git(subRoot, ['commit', '-q', '-m', 'init']);

  const root = makeTmpDir();
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'test']);
  fs.writeFileSync(path.join(root, 'root.txt'), '');
  fs.mkdirSync(path.join(root, 'Assets'), { recursive: true });
  // Local-path submodules require protocol.file.allow=always on git >= 2.38.
  git(root, [
    '-c',
    'protocol.file.allow=always',
    'submodule',
    'add',
    '-q',
    subRoot,
    'Assets/GameFramework',
  ]);
  fs.writeFileSync(path.join(root, 'Assets', 'top.txt'), '');
  git(root, ['add', 'root.txt', 'Assets/top.txt']);
  git(root, ['commit', '-q', '-m', 'add submodule']);
  // Untracked (but not ignored) file — must still be listed.
  fs.writeFileSync(path.join(root, 'untracked-root.txt'), '');
  // Gitignored file — must NOT be listed.
  fs.writeFileSync(path.join(root, '.gitignore'), 'ignored-*.txt\n');
  fs.writeFileSync(path.join(root, 'ignored-secret.txt'), '');
  return { root };
}

describeGit('fetchFilesAndDirs (git repo with submodule)', () => {
  it('includes files tracked inside a git submodule', async () => {
    const { root } = makeGitRepoWithSubmodule();
    const { files } = await fetchFilesAndDirs(root);
    expect(files).toContain('Assets/GameFramework/Editor/Framework.Editor.asmdef');
    expect(files).toContain('Assets/GameFramework/tracked-in-sub.txt');
  });

  it('still lists untracked and tracked top-level files (exclude-standard preserved)', async () => {
    const { root } = makeGitRepoWithSubmodule();
    const { files } = await fetchFilesAndDirs(root);
    expect(files).toContain('untracked-root.txt');
    expect(files).toContain('root.txt');
    expect(files).toContain('Assets/top.txt');
  });

  it('respects .gitignore (does not list ignored files)', async () => {
    const { root } = makeGitRepoWithSubmodule();
    const { files } = await fetchFilesAndDirs(root);
    expect(files).not.toContain('ignored-secret.txt');
  });

  it('derives directories located inside the submodule', async () => {
    const { root } = makeGitRepoWithSubmodule();
    const { dirs } = await fetchFilesAndDirs(root);
    expect(dirs).toContain('Assets/GameFramework');
    expect(dirs).toContain('Assets/GameFramework/Editor');
  });
});

// A WSL project opened in JetBrains runs the backend inside the distro
// (process.platform === 'linux'), yet the IDE hands the project root over the
// wire as a Windows UNC path (`//wsl.localhost/<distro>/...`) that does not exist
// inside the distro. The handler must translate it to the inner Linux path (the
// same resolveWslCwd conversion claude.ts/command.ts already apply) or the `@`
// mention dropdown silently returns an empty list. Issue #195.
//
// These tests build a real temp tree and address it through a synthetic UNC path,
// so they only make sense on a POSIX filesystem — skip on win32.
const describeWsl = process.platform === 'win32' ? describe.skip : describe;

describeWsl('listProjectFilesHandler (WSL UNC workingDir)', () => {
  const originalPlatform = process.platform;

  function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  }

  function mockConns(): ConnectionManager {
    return { sendTo: vi.fn() } as unknown as ConnectionManager;
  }

  function lastSend(conns: ConnectionManager): [string, string, Record<string, unknown>] {
    const calls = (conns.sendTo as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1] as [string, string, Record<string, unknown>];
  }

  function msg(workingDir: string, query: string): IPCMessage {
    return {
      type: MessageType.LIST_PROJECT_FILES,
      payload: { workingDir, query, limit: 20 },
      timestamp: 0,
      requestId: 'req-1',
    };
  }

  // Wrap an absolute Linux temp path as the UNC path the IDE would hand over:
  //   /var/folders/x/proj  ->  //wsl.localhost/Ubuntu/var/folders/x/proj
  function toUnc(linuxAbsPath: string): string {
    return `//wsl.localhost/Ubuntu${linuxAbsPath}`;
  }

  afterEach(() => setPlatform(originalPlatform));

  it('on linux, resolves a WSL UNC workingDir to the inner Linux path before listing', async () => {
    setPlatform('linux');
    const root = makeTmpDir();
    fs.writeFileSync(path.join(root, 'hello-mention.ts'), '');

    const conns = mockConns();
    await listProjectFilesHandler('c1', msg(toUnc(root), 'hello-mention'), conns, {} as Bridge);

    const [connId, type, payload] = lastSend(conns);
    expect(connId).toBe('c1');
    expect(type).toBe(MessageType.ACK);
    expect(payload.requestId).toBe('req-1');
    const files = payload.files as Array<{ relativePath: string; type: string }>;
    expect(files.map((f) => f.relativePath)).toContain('hello-mention.ts');
  });

  it('on linux, a plain Linux workingDir is listed unchanged', async () => {
    setPlatform('linux');
    const root = makeTmpDir();
    fs.writeFileSync(path.join(root, 'plain-file.ts'), '');

    const conns = mockConns();
    await listProjectFilesHandler('c1', msg(root, 'plain-file'), conns, {} as Bridge);

    const [, type, payload] = lastSend(conns);
    expect(type).toBe(MessageType.ACK);
    const files = payload.files as Array<{ relativePath: string; type: string }>;
    expect(files.map((f) => f.relativePath)).toContain('plain-file.ts');
  });
});

// A user-configured `fileSuggestion` command must drive the `@` index exactly
// as it does in the CLI, and any failure must fall back to the built-in index
// so the picker never silently empties. The command runs under a real shell, so
// skip on win32 (needs git bash). Issue #201.
const describeFsCmd = process.platform === 'win32' ? describe.skip : describe;

describeFsCmd('listProjectFilesHandler (fileSuggestion command)', () => {
  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;

  beforeEach(() => {
    // Isolate global Claude settings so the host machine's ~/.claude cannot leak
    // a real fileSuggestion into these tests. Project-scope settings still win,
    // but this keeps the "malformed/absent" cases honest.
    process.env.CLAUDE_CONFIG_DIR = makeTmpDir();
  });
  afterEach(() => {
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
  });

  function conns(): ConnectionManager {
    return { sendTo: vi.fn() } as unknown as ConnectionManager;
  }
  function last(c: ConnectionManager): [string, string, Record<string, unknown>] {
    const calls = (c.sendTo as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1] as [string, string, Record<string, unknown>];
  }
  function message(workingDir: string, query: string): IPCMessage {
    return {
      type: MessageType.LIST_PROJECT_FILES,
      payload: { workingDir, query, limit: 20 },
      timestamp: 0,
      requestId: 'r1',
    };
  }
  function writeProjectSetting(root: string, fileSuggestion: unknown): void {
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    fs.writeFileSync(
      path.join(root, '.claude', 'settings.json'),
      JSON.stringify({ fileSuggestion }),
    );
  }

  it('uses the configured fileSuggestion command instead of the built-in index', async () => {
    const root = makeTmpDir();
    writeProjectSetting(root, {
      type: 'command',
      command: "printf 'custom/one.ts\\ncustom/two.ts\\n'",
    });
    const c = conns();
    await listProjectFilesHandler('c1', message(root, 'one'), c, {} as Bridge);

    const [, type, payload] = last(c);
    expect(type).toBe(MessageType.ACK);
    const files = payload.files as Array<{ relativePath: string; type: string }>;
    expect(files.map((f) => f.relativePath)).toEqual(['custom/one.ts', 'custom/two.ts']);
    expect(files.every((f) => f.type === 'file')).toBe(true);
  });

  it('passes the mention query to the command on stdin', async () => {
    const root = makeTmpDir();
    // `cat` echoes stdin, so the single parsed line is the JSON payload the
    // command received — proving the query was delivered as {"query":...}.
    writeProjectSetting(root, { type: 'command', command: 'cat' });
    const c = conns();
    await listProjectFilesHandler('c1', message(root, 'Frame'), c, {} as Bridge);

    const [, , payload] = last(c);
    const files = payload.files as Array<{ relativePath: string }>;
    expect(files.map((f) => f.relativePath)).toEqual(['{"query":"Frame"}']);
  });

  it('falls back to the built-in index when the command exits non-zero', async () => {
    const root = makeTmpDir();
    fs.writeFileSync(path.join(root, 'real-file.ts'), '');
    writeProjectSetting(root, { type: 'command', command: 'exit 1' });
    const c = conns();
    await listProjectFilesHandler('c1', message(root, 'real-file'), c, {} as Bridge);

    const [, type, payload] = last(c);
    expect(type).toBe(MessageType.ACK);
    const files = payload.files as Array<{ relativePath: string }>;
    expect(files.map((f) => f.relativePath)).toContain('real-file.ts');
  });

  it('ignores a malformed fileSuggestion and uses the built-in index', async () => {
    const root = makeTmpDir();
    fs.writeFileSync(path.join(root, 'real-file.ts'), '');
    writeProjectSetting(root, { type: 'notcommand' });
    const c = conns();
    await listProjectFilesHandler('c1', message(root, 'real-file'), c, {} as Bridge);

    const [, , payload] = last(c);
    const files = payload.files as Array<{ relativePath: string }>;
    expect(files.map((f) => f.relativePath)).toContain('real-file.ts');
  });
});

describe('rankFiles (fuzzy subsequence + word-boundary scoring)', () => {
  const files = [
    'webview/src/adapters/BrowserAdapter.ts',
    'build.gradle.kts',
    'webview/src/adapters/JetBrainsAdapter.ts',
    'gradle/wrapper/gradle-wrapper.jar',
  ];
  const dirs = ['webview/src/adapters', 'gradle/wrapper', 'gradle'];

  it('ranks BrowserAdapter.ts first for query "brad"', () => {
    const result = rankFiles(files, dirs, 'brad', 20);

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].relativePath).toBe('webview/src/adapters/BrowserAdapter.ts');
    expect(result[0].type).toBe('file');
  });

  it('matches BrowserAdapter.ts, build.gradle.kts and JetBrainsAdapter.ts for query "brad"', () => {
    const result = rankFiles(files, dirs, 'brad', 20);
    const paths = result.map((r) => r.relativePath);

    expect(paths).toContain('webview/src/adapters/BrowserAdapter.ts');
    expect(paths).toContain('build.gradle.kts');
    expect(paths).toContain('webview/src/adapters/JetBrainsAdapter.ts');
  });

  it('excludes "gradle" directory (basename has no "b") from query "brad" — noise removal regression', () => {
    const result = rankFiles(files, dirs, 'brad', 20);
    const paths = result.map((r) => r.relativePath);

    expect(paths).not.toContain('gradle');
  });

  it('matches JetBrainsAdapter.ts for query "jbadapter"', () => {
    const result = rankFiles(files, dirs, 'jbadapter', 20);
    const paths = result.map((r) => r.relativePath);

    expect(paths).toContain('webview/src/adapters/JetBrainsAdapter.ts');
  });

  it('ranks word-boundary (camelCase) matches above scattered matches', () => {
    // 'AB' as query: 'AdapterBase.ts' has A at start (boundary) and B at boundary too (camelCase),
    // while 'zazbz.ts' has a and b scattered with no boundary.
    const boundaryFiles = ['src/AdapterBase.ts', 'src/zazbz.ts'];
    const result = rankFiles(boundaryFiles, [], 'ab', 20);

    expect(result[0].relativePath).toBe('src/AdapterBase.ts');
  });

  it('ranks basename matches above path-only matches', () => {
    // 'x/foobar.ts' has basename 'foobar.ts' that matches 'foobar' directly (basename bonus).
    // 'foobar/y.ts' has basename 'y.ts' that does NOT match 'foobar' as a subsequence;
    // only the full path matches (no basename bonus). The former must rank first.
    const basenameMatchFiles = ['x/foobar.ts', 'foobar/y.ts'];
    const basenameResult = rankFiles(basenameMatchFiles, [], 'foobar', 20);
    expect(basenameResult[0].relativePath).toBe('x/foobar.ts');
  });

  it('returns directories only when query is empty', () => {
    const result = rankFiles(files, dirs, '', 20);

    expect(result.every((r) => r.type === 'directory')).toBe(true);
    expect(result.length).toBe(dirs.length);
  });

  it('respects the limit parameter', () => {
    const manyFiles = Array.from({ length: 50 }, (_, i) => `file-brad-${i}.ts`);
    const result = rankFiles(manyFiles, [], 'brad', 5);

    expect(result.length).toBe(5);
  });

  it('returns an empty array for a query with no matches', () => {
    const result = rankFiles(files, dirs, 'zzzznomatch', 20);

    expect(result).toEqual([]);
  });

  it('breaks ties by shorter relative path first', () => {
    const tieFiles = ['a/verylongdirectoryname/test.ts', 'test.ts'];
    const result = rankFiles(tieFiles, [], 'test', 20);

    expect(result[0].relativePath).toBe('test.ts');
  });
});

describe('rankFiles matchIndices (highlighted character positions)', () => {
  const files = [
    'webview/src/adapters/BrowserAdapter.ts',
    'build.gradle.kts',
    'webview/src/adapters/JetBrainsAdapter.ts',
    'gradle/wrapper/gradle-wrapper.jar',
  ];
  const dirs = ['webview/src/adapters', 'gradle/wrapper', 'gradle'];

  it('returns matchIndices pointing to the matched characters (relativePath-based, ascending) for "brad"', () => {
    const result = rankFiles(files, dirs, 'brad', 20);
    const match = result.find((r) => r.relativePath === 'webview/src/adapters/BrowserAdapter.ts');

    expect(match).toBeDefined();
    expect(match!.matchIndices).toBeDefined();
    const indices = match!.matchIndices!;
    const query = 'brad';

    // ascending order
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }

    // each index must actually correspond to the query character (case-insensitive)
    expect(indices.length).toBe(query.length);
    for (let i = 0; i < query.length; i++) {
      expect(match!.relativePath[indices[i]].toLowerCase()).toBe(query[i]);
    }
  });

  it('returns contiguous matchIndices for an exact substring query ("Adapter")', () => {
    const result = rankFiles(files, dirs, 'Adapter', 20);
    const match = result.find((r) => r.relativePath === 'webview/src/adapters/BrowserAdapter.ts');

    expect(match).toBeDefined();
    const indices = match!.matchIndices!;
    expect(indices.length).toBe('Adapter'.length);
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBe(indices[i - 1] + 1);
    }
    const matchedSubstring = indices.map((idx) => match!.relativePath[idx]).join('');
    expect(matchedSubstring.toLowerCase()).toBe('adapter');
  });

  it('omits matchIndices (or returns empty array) for empty query', () => {
    const result = rankFiles(files, dirs, '', 20);

    for (const entry of result) {
      expect(entry.matchIndices ?? []).toEqual([]);
    }
  });
});
