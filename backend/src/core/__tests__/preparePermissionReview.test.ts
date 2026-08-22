/**
 * Where a proposed edit gets reviewed, and the one thing that must hold either
 * way: the change is stored, so SOME surface can show it.
 *
 * `showDiffInIde` used to gate the storing as well as the opening, which was
 * fine while the IDE's viewer was the only review there was. It is not any
 * more — the webview draws its own from the same entry — so turning the setting
 * off must stop the IDE tab without taking the change away.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const readMergedSettings = vi.fn();
vi.mock('../features/settings', () => ({
  readMergedSettings: (...args: unknown[]) => readMergedSettings(...args),
}));

import { preparePermissionReview } from '../claude-process';
import { clearPreviews, peekPreview } from '../features/diffPreview';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

function fakeBridge() {
  return { openDiff: vi.fn(async () => undefined) } as never;
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
  it('stores the change and opens the IDE diff by default', async () => {
    const bridge = fakeBridge();
    await request(bridge);

    expect(peekPreview('toolu_1')).toBeDefined();
    expect((bridge as unknown as { openDiff: ReturnType<typeof vi.fn> }).openDiff).toHaveBeenCalled();
  });

  it('still stores the change when the IDE viewer is turned off', async () => {
    // The setting says where to review, not whether to. Dropping the entry here
    // would leave the webview's review with nothing to draw — the bug this test
    // exists to prevent.
    readMergedSettings.mockResolvedValue({ settings: { showDiffInIde: false } });
    const bridge = fakeBridge();
    await request(bridge);

    expect(peekPreview('toolu_1')).toBeDefined();
    expect((bridge as unknown as { openDiff: ReturnType<typeof vi.fn> }).openDiff).not.toHaveBeenCalled();
  });

  it('keeps the stored change faithful to what was proposed', async () => {
    await request(fakeBridge());

    const stored = peekPreview('toolu_1')!;
    expect(stored.filePath).toBe(filePath);
    expect(stored.oldContent).toBe('before\n');
    expect(stored.newContent).toBe('after\n');
    expect(stored.controlRequestId).toBe('ctrl-1');
    expect(stored.sessionId).toBe('sess-1');
  });

  it('stores nothing for a tool that proposes no file change', async () => {
    const bridge = fakeBridge();
    await preparePermissionReview({
      bridge: bridge as never,
      sessionId: 'sess-1',
      workingDir: dir,
      toolName: 'Bash',
      toolInput: { command: 'ls' },
      toolUseId: 'toolu_bash',
      controlRequestId: 'ctrl-1',
    });

    expect(peekPreview('toolu_bash')).toBeUndefined();
    expect((bridge as unknown as { openDiff: ReturnType<typeof vi.fn> }).openDiff).not.toHaveBeenCalled();
  });

  it('stores nothing when the proposal matches the file already', async () => {
    // A no-op edit has nothing to review; offering one would be a tab and a
    // question about a change that is not there.
    const bridge = fakeBridge();
    await preparePermissionReview({
      bridge: bridge as never,
      sessionId: 'sess-1',
      workingDir: dir,
      toolName: 'Write',
      toolInput: { file_path: filePath, content: 'before\n' },
      toolUseId: 'toolu_noop',
      controlRequestId: 'ctrl-1',
    });

    expect(peekPreview('toolu_noop')).toBeUndefined();
  });
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});
