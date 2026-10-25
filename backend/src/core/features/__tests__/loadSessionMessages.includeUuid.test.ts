import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../getProjectSessionsPath', () => ({
  getProjectSessionsPath: vi.fn(),
}));

import { loadSessionMessages } from '../loadSessionMessages';
import { getProjectSessionsPath } from '../getProjectSessionsPath';

const mockGetPath = vi.mocked(getProjectSessionsPath);

/** A straight chain e0 ← e1 ← … ← e(n-1), so every entry is on the active chain. */
function chainOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) =>
    JSON.stringify({
      type: i % 2 === 0 ? 'user' : 'assistant',
      uuid: `e${i}`,
      parentUuid: i === 0 ? null : `e${i - 1}`,
      message: { content: `entry ${i}` },
    }),
  );
}

describe('loadSessionMessages with includeUuid', () => {
  let tmpDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    tmpDir = await mkdtemp(join(tmpdir(), 'load-include-'));
    mockGetPath.mockResolvedValue(tmpDir);
    await writeFile(join(tmpDir, 's.jsonl'), chainOf(200).join('\n'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('widens the newest page back to the target', async () => {
    const page = await loadSessionMessages('/w', 's', undefined, 50, 'e30');
    expect(page.messages[0].uuid).toBe('e30');
    expect(page.messages.at(-1)?.uuid).toBe('e199');
    expect(page.hasMore).toBe(true);
  });

  it('with a cursor, reaches back to the target and not one entry further', async () => {
    // The client holds e150..e199 and moves to a match at e30.
    const page = await loadSessionMessages('/w', 's', 'e150', 50, 'e30');
    expect(page.messages[0].uuid).toBe('e30');
    expect(page.messages.at(-1)?.uuid).toBe('e149');
    expect(page.messages).toHaveLength(120);
    expect(page.hasMore).toBe(true);
    expect(page.oldestUuid).toBe('e30');
  });

  it('with a cursor, serves the ordinary page when the target is within it', async () => {
    const page = await loadSessionMessages('/w', 's', 'e150', 50, 'e140');
    expect(page.messages[0].uuid).toBe('e100');
    expect(page.messages).toHaveLength(50);
  });

  it('with a cursor, a target newer than the cursor changes nothing', async () => {
    const page = await loadSessionMessages('/w', 's', 'e150', 50, 'e190');
    expect(page.messages[0].uuid).toBe('e100');
    expect(page.messages).toHaveLength(50);
  });

  it('with a cursor, can reach the very first entry and then reports nothing more', async () => {
    const page = await loadSessionMessages('/w', 's', 'e150', 50, 'e0');
    expect(page.messages[0].uuid).toBe('e0');
    expect(page.hasMore).toBe(false);
  });

  it('serves the ordinary page for a target that is not in the chain', async () => {
    const page = await loadSessionMessages('/w', 's', 'e150', 50, 'does-not-exist');
    expect(page.messages[0].uuid).toBe('e100');
    expect(page.messages).toHaveLength(50);
  });
});
