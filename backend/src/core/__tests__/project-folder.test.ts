import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { isFolderGone } from '../project-folder';

describe('isFolderGone', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ccg-folder-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('is false for a folder that is there', async () => {
    expect(await isFolderGone(dir)).toBe(false);
  });

  it('is true for a folder that was deleted', async () => {
    rmSync(dir, { recursive: true, force: true });

    expect(await isFolderGone(dir)).toBe(true);
  });

  it('is true when the path is a file, since nothing can be started in it', async () => {
    const file = join(dir, 'file.txt');
    writeFileSync(file, 'x');

    expect(await isFolderGone(file)).toBe(true);
  });

  it('is true when a folder above the path is gone', async () => {
    expect(await isFolderGone(join(dir, 'gone', 'project'))).toBe(true);
  });
});
