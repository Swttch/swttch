import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let configDir = '';
vi.mock('../claudeConfigDir', () => ({ getClaudeConfigDir: () => configDir }));
vi.mock('../getProjectSessionsPath', () => ({ getProjectSessionsPath: async (dir: string) => join(configDir, 'projects', dir.replace(/[^a-zA-Z0-9]/g, '-')) }));

import { findSessionTranscript, resetFoundSessionTranscripts } from '../findSessionTranscript';

const put = (folder: string, id: string) => {
  mkdirSync(join(configDir, 'projects', folder), { recursive: true });
  writeFileSync(join(configDir, 'projects', folder, `${id}.jsonl`), '{}\n');
  return join(configDir, 'projects', folder, `${id}.jsonl`);
};

// A session another session started lives in the folder it was started for, not in the one of the screen that
// points at it (#711).
describe('findSessionTranscript', () => {
  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'find-transcript-'));
    resetFoundSessionTranscripts();
  });
  afterEach(() => rmSync(configDir, { recursive: true, force: true }));

  it('finds the transcript in the folder it was asked for', async () => {
    const file = put('-work-a', 's1');
    expect(await findSessionTranscript('s1', '/work/a')).toBe(file);
  });

  it('finds it in another project folder when the folder asked for does not hold it', async () => {
    put('-work-a', 'other');
    const file = put('-work-b', 's1');
    expect(await findSessionTranscript('s1', '/work/a')).toBe(file);
  });

  it('finds it without any folder named', async () => {
    const file = put('-work-b', 's1');
    expect(await findSessionTranscript('s1')).toBe(file);
  });

  it('says nothing is there when no folder holds it', async () => {
    put('-work-a', 'other');
    expect(await findSessionTranscript('gone', '/work/a')).toBeUndefined();
  });

  it('answers a deleted file as gone even though it was found before', async () => {
    const file = put('-work-b', 's1');
    expect(await findSessionTranscript('s1', '/work/a')).toBe(file);
    rmSync(file);
    expect(await findSessionTranscript('s1', '/work/a')).toBeUndefined();
  });

  it('refuses an id that is not a plain name', async () => {
    put('-work-a', 's1');
    expect(await findSessionTranscript('../projects/-work-a/s1', '/work/a')).toBeUndefined();
    expect(await findSessionTranscript('', '/work/a')).toBeUndefined();
  });
});
