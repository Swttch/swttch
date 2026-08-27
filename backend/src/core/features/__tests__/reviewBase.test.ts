import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { compareReviewBase, overlapsAcceptedRegions, readCurrentContent } from '../reviewBase';

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'review-base-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function file(name: string, content: string): Promise<string> {
  const p = join(dir, name);
  await writeFile(p, content, 'utf8');
  return p;
}

describe('compareReviewBase', () => {
  it('reports unchanged when the file still matches the base', async () => {
    const p = await file('a.txt', lines(10));
    const result = await compareReviewBase({ filePath: p, oldContent: lines(10) });
    expect(result.status).toBe('unchanged');
  });

  it('reports the #359 case: disk moved while the review waited', async () => {
    const base = lines(1090);
    const p = await file('big.php', base.replace('line 900\n', 'line 900 USER WIP\n'));

    const result = await compareReviewBase({ filePath: p, oldContent: base });

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('unreachable');
    expect(result.currentContent).toContain('USER WIP');
  });

  it('treats a still-absent file as unchanged for a Write creating it', async () => {
    const result = await compareReviewBase({
      filePath: join(dir, 'not-created-yet.txt'),
      oldContent: '',
    });
    expect(result.status).toBe('unchanged');
  });

  it('reports unreadable when a file that had content is gone', async () => {
    const result = await compareReviewBase({
      filePath: join(dir, 'deleted.txt'),
      oldContent: lines(3),
    });
    expect(result.status).toBe('unreadable');
  });

  it('flags no overlap when the disk change misses every accepted region', async () => {
    const base = lines(100);
    // Reviewer kept lines 0..5. The user edited line 90, far away.
    const p = await file('x.txt', base.replace('line 90\n', 'line 90 EDITED\n'));

    const result = await compareReviewBase(
      { filePath: p, oldContent: base },
      [{ oldStart: 0, oldEnd: 5, newStart: 0, newEnd: 5 }],
    );

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('unreachable');
    expect(result.overlapsAccepted).toBe(false);
  });

  it('flags overlap when the disk change lands inside an accepted region', async () => {
    const base = lines(100);
    const p = await file('y.txt', base.replace('line 3\n', 'line 3 EDITED\n'));

    const result = await compareReviewBase(
      { filePath: p, oldContent: base },
      [{ oldStart: 0, oldEnd: 5, newStart: 0, newEnd: 5 }],
    );

    expect(result.status).toBe('changed');
    if (result.status !== 'changed') throw new Error('unreachable');
    expect(result.overlapsAccepted).toBe(true);
  });
});

describe('overlapsAcceptedRegions', () => {
  const base = lines(100);

  it('treats an absent selection as overlapping, so nothing passes unmentioned', () => {
    const current = base.replace('line 50\n', 'line 50 EDITED\n');
    expect(overlapsAcceptedRegions(base, current, undefined)).toBe(true);
  });

  it('treats an empty selection as overlapping', () => {
    const current = base.replace('line 50\n', 'line 50 EDITED\n');
    expect(overlapsAcceptedRegions(base, current, [])).toBe(true);
  });

  it('returns false when identical content produces no hunks', () => {
    expect(overlapsAcceptedRegions(base, base, [{ oldStart: 0, oldEnd: 5, newStart: 0, newEnd: 5 }]))
      .toBe(false);
  });

  it('detects an edit exactly on the boundary line of an accepted range', () => {
    // Range covers old lines [10, 20) 0-based, i.e. "line 11".."line 20".
    const range = [{ oldStart: 10, oldEnd: 20, newStart: 10, newEnd: 20 }];

    const insideEdge = base.replace('line 11\n', 'line 11 EDITED\n');
    expect(overlapsAcceptedRegions(base, insideEdge, range)).toBe(true);

    const lastInside = base.replace('line 20\n', 'line 20 EDITED\n');
    expect(overlapsAcceptedRegions(base, lastInside, range)).toBe(true);
  });
});

describe('readCurrentContent', () => {
  it('returns null rather than throwing for a missing file', async () => {
    expect(await readCurrentContent(join(dir, 'nope.txt'))).toBeNull();
  });

  it('returns the file content when it can be read', async () => {
    const p = await file('ok.txt', 'hello\n');
    expect(await readCurrentContent(p)).toBe('hello\n');
  });
});
