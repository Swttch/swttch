import { mkdtempSync, rmSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Whether this machine lets a test make a symbolic link. Windows refuses without
 * administrator rights or developer mode, and a test about links is no test of
 * anything there, so it is skipped rather than failed.
 */
export const canSymlink: boolean = (() => {
  const probe = mkdtempSync(join(tmpdir(), 'symlink-probe-'));
  try {
    symlinkSync(probe, join(probe, 'link'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();
