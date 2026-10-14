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

  // A backend running inside a WSL distribution (platform 'linux') is handed the
  // project root as the Windows UNC path the IDE knows it by. That string names no
  // folder to a Linux process; the folder is where the Linux path inside the
  // distribution points, which is also where the CLI is started (#561).
  describe('on a WSL backend handed a Windows UNC path', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    });

    afterEach(() => {
      if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    });

    it('is false for a folder that is there', async () => {
      expect(await isFolderGone(`//wsl.localhost/Ubuntu${dir}`)).toBe(false);
    });

    it('is false for a folder that is there, named through the legacy wsl$ host', async () => {
      expect(await isFolderGone(`//wsl$/Ubuntu${dir}`)).toBe(false);
    });

    it('is false for a folder that is there, written with back-slashes', async () => {
      const unc = `\\\\wsl.localhost\\Ubuntu${dir.replace(/\//g, '\\')}`;

      expect(await isFolderGone(unc)).toBe(false);
    });

    it('is true for a folder that was deleted', async () => {
      rmSync(dir, { recursive: true, force: true });

      expect(await isFolderGone(`//wsl.localhost/Ubuntu${dir}`)).toBe(true);
    });
  });
});
