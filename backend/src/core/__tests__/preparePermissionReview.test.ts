/**
 * What happens when the CLI asks permission for a file edit: the change is
 * stored, so some surface can show it.
 *
 * Storing and opening used to happen together here, which made this the second
 * place that decided which surface draws a review — the webview being the
 * first, for the file-name link. The two read their settings for different
 * working directories and disagreed, so one edit ended up reviewed on both
 * surfaces at once (#359). Opening now belongs to openDiffHandler alone, and
 * this function only stores.
 *
 * Storing is the part that must never be skipped. Every review reads this entry,
 * so dropping it would leave the file name in the prompt with nothing to open.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const readMergedSettings = vi.fn();
vi.mock('../features/settings', () => ({
  readMergedSettings: (...args: unknown[]) => readMergedSettings(...args),
}));

import { preparePermissionReview } from '../claude-process';
import { DiffSurface } from '../../shared';
import { clearPreviews, peekPreview } from '../features/diffPreview';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

function fakeBridge() {
  return {
    openDiff: vi.fn(async () => undefined),
    openDiffTab: vi.fn(async () => undefined),
  } as never;
}

/** The bridge's calls, named so a test reads as what the IDE was asked for. */
function calls(bridge: unknown) {
  return bridge as { openDiff: ReturnType<typeof vi.fn>; openDiffTab: ReturnType<typeof vi.fn> };
}

let dir = '';
let filePath = '';

beforeEach(async () => {
  clearPreviews();
  readMergedSettings.mockReset();
  readMergedSettings.mockResolvedValue({ settings: {} });
  dir = await mkdtemp(join(tmpdir(), 'ccg-review-'));
  filePath = join(dir, 'cart.js');
  await writeFile(filePath, 'before\n', 'utf8');
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

function request(bridge: unknown) {
  return preparePermissionReview({
    bridge: bridge as never,
    sessionId: 'sess-1',
    workingDir: dir,
    toolName: 'Write',
    toolInput: { file_path: filePath, content: 'after\n' },
    toolUseId: 'toolu_1',
    controlRequestId: 'ctrl-1',
  });
}

describe('preparePermissionReview', () => {
  it('stores the change', async () => {
    await request(fakeBridge());

    expect(peekPreview('toolu_1')).toBeDefined();
  });

  /*
   * The surfaces are opened by openDiffHandler, which the webview asks. Opening
   * one from here as well is what put two reviews of the same edit on screen.
   */
  it('opens no surface itself', async () => {
    const bridge = fakeBridge();
    await request(bridge);

    expect(calls(bridge).openDiff).not.toHaveBeenCalled();
    expect(calls(bridge).openDiffTab).not.toHaveBeenCalled();
  });

  /**
   * The setting names where a review is drawn, not whether the change is kept.
   * Dropping the entry for a surface this process does not open would leave the
   * webview's review with nothing to draw.
   */
  it('stores the change whichever surface the settings name', async () => {
    for (const surface of [DiffSurface.IDE, DiffSurface.BUILT_IN]) {
      clearPreviews();
      readMergedSettings.mockResolvedValue({ settings: { diffSurface: surface } });
      await request(fakeBridge());

      expect(peekPreview('toolu_1')).toBeDefined();
    }
  });

  /**
   * Turning the unprompted open off must not take the change away (#349). The
   * file name in the prompt reads this entry, and it is the only way in once
   * nothing opens by itself.
   */
  it('stores the change even when the unprompted open is turned off', async () => {
    readMergedSettings.mockResolvedValue({
      settings: { autoOpenDiffOnPermission: false, diffSurface: DiffSurface.IDE },
    });
    await request(fakeBridge());

    expect(peekPreview('toolu_1')).toBeDefined();
  });

  it('keeps the stored change faithful to what was proposed', async () => {
    await request(fakeBridge());

    const stored = peekPreview('toolu_1')!;
    expect(stored.filePath).toBe(filePath);
    expect(stored.oldContent).toBe('before\n');
    expect(stored.newContent).toBe('after\n');
  });

  /**
   * Proves the assertions above are reading a real run: a tool that edits no
   * file must leave nothing behind, so a test that always found an entry would
   * be finding one this function did not store.
   */
  it('stores nothing for a tool that edits no file', async () => {
    await preparePermissionReview({
      bridge: fakeBridge() as never,
      sessionId: 'sess-1',
      workingDir: dir,
      toolName: 'Bash',
      toolInput: { command: 'ls' },
      toolUseId: 'toolu_bash',
      controlRequestId: 'ctrl-1',
    });

    expect(peekPreview('toolu_bash')).toBeUndefined();
  });
});
