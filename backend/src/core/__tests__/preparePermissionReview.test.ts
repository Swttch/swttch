/**
 * Where a proposed edit gets reviewed, and the one thing that must hold either
 * way: the change is stored, so SOME surface can show it.
 *
 * The setting behind this used to gate the storing as well as the opening, which
 * was fine while the IDE's viewer was the only review there was. It is not any
 * more — the webview draws its own from the same entry — so choosing another
 * surface must stop the IDE tab without taking the change away.
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

/** Settings for the built-in surface, with the presentation and chat host given. */
function builtIn(presentation?: string, hostMode?: string) {
  return {
    settings: {
      diffSurface: DiffSurface.BUILT_IN,
      ...(presentation ? { browserDiffPresentation: presentation } : {}),
      ...(hostMode ? { hostMode } : {}),
    },
  };
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

  it('still stores the change when the built-in surface is chosen', async () => {
    // The setting says where to review, not whether to. Dropping the entry here
    // would leave the webview's review with nothing to draw — the bug this test
    // exists to prevent.
    readMergedSettings.mockResolvedValue({ settings: { diffSurface: DiffSurface.BUILT_IN } });
    const bridge = fakeBridge();
    await request(bridge);

    expect(peekPreview('toolu_1')).toBeDefined();
    expect((bridge as unknown as { openDiff: ReturnType<typeof vi.fn> }).openDiff).not.toHaveBeenCalled();
  });

  it('opens the IDE viewer when the surface is unset', async () => {
    // Absent must keep behaving as it did before the setting was a choice,
    // including for anyone whose file the migration has not rewritten yet.
    readMergedSettings.mockResolvedValue({ settings: {} });
    const bridge = fakeBridge();
    await request(bridge);

    expect((bridge as unknown as { openDiff: ReturnType<typeof vi.fn> }).openDiff).toHaveBeenCalled();
  });

  /**
   * Which window the built-in review gets.
   *
   * An editor tab is ours to ask the IDE for. An overlay is not — the webview
   * draws it over a screen this process does not own, and opens it itself — so
   * asking for a tab as well would put the same change on screen twice. That is
   * what shipped: the setting said overlay and a tab opened anyway.
   */
  describe('the built-in surface, tab or overlay', () => {
    it('asks for an editor tab by default', async () => {
      const bridge = fakeBridge();
      readMergedSettings.mockResolvedValue(builtIn());
      await request(bridge);

      expect(calls(bridge).openDiffTab).toHaveBeenCalled();
    });

    it('leaves the overlay to the webview', async () => {
      const bridge = fakeBridge();
      readMergedSettings.mockResolvedValue(builtIn('overlay', 'editor-tab'));
      await request(bridge);

      expect(calls(bridge).openDiffTab).not.toHaveBeenCalled();
      // Still stored, or the overlay would have nothing to draw.
      expect(peekPreview('toolu_1')).toBeDefined();
    });

    /*
     * An overlay inherits the room of what it covers, and a sidebar chat is a
     * column. The preference cannot be honoured there, so the tab is the answer
     * — the same rule the webview applies to the file-name link.
     */
    it('asks for a tab when an overlay has no room', async () => {
      const bridge = fakeBridge();
      readMergedSettings.mockResolvedValue(builtIn('overlay', 'tool-window'));
      await request(bridge);

      expect(calls(bridge).openDiffTab).toHaveBeenCalled();
    });

    it('reads an unset chat host as the panel', async () => {
      // The settings file falls back to editor-tab, so an overlay must work for
      // someone who has never opened that setting.
      const bridge = fakeBridge();
      readMergedSettings.mockResolvedValue(builtIn('overlay'));
      await request(bridge);

      expect(calls(bridge).openDiffTab).not.toHaveBeenCalled();
    });
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
