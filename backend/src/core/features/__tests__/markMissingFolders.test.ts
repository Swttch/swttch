import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ProjectListEntry, markMissingFolders } from '../getProjectsList';

// The project picker says which projects have lost their folder, so the user is not
// left to find out by opening one and sending a message.

let parent: string;

beforeEach(() => {
  parent = mkdtempSync(join(tmpdir(), 'ccg-mark-'));
});

afterEach(() => {
  rmSync(parent, { recursive: true, force: true });
});

const entry = (path: string) => new ProjectListEntry('name', path, 3, '2026-10-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');

it('marks the project whose folder is gone and leaves the others unmarked', async () => {
  const present = parent;
  const gone = join(parent, 'ccg-demo');

  const marked = await markMissingFolders([entry(present), entry(gone)]);

  expect(marked.map((project) => [project.path, project.folderMissing])).toEqual([
    [present, false],
    [gone, true],
  ]);
});

it('keeps everything else about the entry as it was', async () => {
  const original = entry(join(parent, 'ccg-demo'));

  const [marked] = await markMissingFolders([original]);

  expect(marked).toMatchObject({
    name: original.name,
    path: original.path,
    sessionCount: 3,
    lastModified: original.lastModified,
    createdAt: original.createdAt,
  });
});

it('sends the flag to the webview next to the fields it has always received', async () => {
  const [marked] = await markMissingFolders([entry(join(parent, 'ccg-demo'))]);

  expect(JSON.parse(JSON.stringify(marked))).toEqual({
    name: 'name',
    path: join(parent, 'ccg-demo'),
    sessionCount: 3,
    lastModified: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    folderMissing: true,
  });
});
