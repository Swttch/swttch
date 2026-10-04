import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// The migration settles the Claude data directory to the global one before it
// reads; here the fixture supplies that directory through CLAUDE_CONFIG_DIR.
vi.mock('../../claude', () => ({
  Claude: { applyConfigDir: vi.fn().mockResolvedValue(undefined) },
}));

import { MigrationContext } from '../../entities/migration/Migration';
import { ProjectCollection } from '../../entities/project/Project.collection';
import CreateProjects from '../20261004120000_create-projects';

describe('creating the projects table', () => {
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR;
  const originalCcgHome = process.env.CCG_HOME;
  let root: string;
  let projectsDir: string;

  beforeEach(() => {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'ccg-create-projects-')));
    projectsDir = join(root, 'claude', 'projects');
    mkdirSync(projectsDir, { recursive: true });
    process.env.CLAUDE_CONFIG_DIR = join(root, 'claude');
    process.env.CCG_HOME = join(root, 'ccg');
  });

  afterEach(() => {
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir;
    if (originalCcgHome === undefined) delete process.env.CCG_HOME;
    else process.env.CCG_HOME = originalCcgHome;
    rmSync(root, { recursive: true, force: true });
  });

  const session = (cwd: string, id: string, mtimeSeconds: number) => {
    const folder = join(projectsDir, cwd.replace(/[^a-zA-Z0-9]/g, '-'));
    mkdirSync(folder, { recursive: true });
    const path = join(folder, `${id}.jsonl`);
    writeFileSync(path, JSON.stringify({ type: 'user', cwd }) + '\n');
    utimesSync(path, mtimeSeconds, mtimeSeconds);
  };

  const run = () => new CreateProjects().up(new MigrationContext(join(root, 'home')));

  it('registers every directory the CLI has recorded sessions in', async () => {
    const a = join(root, 'work', 'a');
    const b = join(root, 'work', 'b');
    session(a, 'one', 1_700_000_000);
    session(b, 'two', 1_700_000_100);
    session(b, 'three', 1_700_000_200);

    const report = await run();

    expect(report.summary).toBe('registered 2 projects');
    const projects = await new ProjectCollection().all();
    expect(projects.map((project) => [project.path, project.sessionCount]).sort()).toEqual([
      [a, 1],
      [b, 2],
    ]);
  });

  it('registers nothing when the CLI has no records', async () => {
    const report = await run();

    expect(report.summary).toBe('registered 0 projects');
    expect(await new ProjectCollection().all()).toEqual([]);
  });

  it('can run again without registering anything twice', async () => {
    session(join(root, 'work', 'a'), 'one', 1_700_000_000);
    await run();

    await run();

    expect(await new ProjectCollection().all()).toHaveLength(1);
  });

  it('reads and does not touch the CLI\'s records', async () => {
    session(join(root, 'work', 'a'), 'one', 1_700_000_000);
    const folder = join(projectsDir, join(root, 'work', 'a').replace(/[^a-zA-Z0-9]/g, '-'));

    await run();

    expect(require('fs').readdirSync(folder)).toEqual(['one.jsonl']);
  });
});
