/**
 * Opening the review for a pending file-edit request.
 *
 * This hook used to choose the surface itself, from settings the webview had
 * loaded — often without a working directory, so a project's own choice never
 * reached it. The backend chose separately, from settings merged for the
 * session's directory, and the two disagreed: the unprompted open put the IDE's
 * viewer on screen while the file-name link opened the built-in page, both for
 * the same edit (#359).
 *
 * The hook now asks and the backend answers. What is pinned here is that the
 * hook adds no choice of its own on top of the answer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { ReviewTarget } from '@/shared';

const openReview = vi.fn();
const api = { tools: { openReview } };
vi.mock('@/contexts/ApiContext', () => ({ useApi: () => api }));

const isJetBrains = vi.fn();
vi.mock('@/config/environment', () => ({ isJetBrains: () => isJetBrains() }));

const adapterOpenDiff = vi.fn();
vi.mock('@/adapters', () => ({ getAdapter: () => ({ openDiff: adapterOpenDiff }) }));

import { useOpenDiffReview } from '../useOpenDiffReview';

const open = () => renderHook(() => useOpenDiffReview()).result.current;

beforeEach(() => {
  openReview.mockReset();
  adapterOpenDiff.mockReset();
  isJetBrains.mockReturnValue(true);
  openReview.mockResolvedValue({ target: ReviewTarget.IDE_VIEWER });
});

describe('useOpenDiffReview', () => {
  it('asks the backend to open the review, sending only the id', async () => {
    await open()('toolu_1');

    expect(openReview).toHaveBeenCalledWith('toolu_1');
  });

  it('reports nothing left to do when the IDE viewer drew it', async () => {
    openReview.mockResolvedValue({ target: ReviewTarget.IDE_VIEWER });

    expect(await open()('toolu_1')).toEqual({ kind: 'opened' });
    expect(adapterOpenDiff).not.toHaveBeenCalled();
  });

  it('reports nothing left to do when an editor tab drew it', async () => {
    openReview.mockResolvedValue({ target: ReviewTarget.BUILT_IN_TAB });

    expect(await open()('toolu_1')).toEqual({ kind: 'opened' });
    expect(adapterOpenDiff).not.toHaveBeenCalled();
  });

  /**
   * The one surface the backend cannot open: the webview owns the screen an
   * overlay covers, so the answer comes back for the caller to mount.
   */
  it('reports an overlay back for the caller to mount', async () => {
    openReview.mockResolvedValue({ target: ReviewTarget.BUILT_IN_OVERLAY });

    expect(await open()('toolu_1')).toEqual({ kind: 'overlay', toolUseId: 'toolu_1' });
  });

  /**
   * Outside an IDE there is no host to ask for a window, so the adapter opens
   * the page itself.
   */
  it('opens a browser window itself when there is no IDE', async () => {
    isJetBrains.mockReturnValue(false);
    openReview.mockResolvedValue({ target: ReviewTarget.BUILT_IN_WINDOW });

    expect(await open()('toolu_1')).toEqual({ kind: 'opened' });
    expect(adapterOpenDiff).toHaveBeenCalledWith('toolu_1');
  });

  /**
   * Inside an IDE the backend has already opened whatever it chose, so opening
   * a browser window on top would put the same change on screen twice.
   */
  it('opens no window of its own inside an IDE', async () => {
    isJetBrains.mockReturnValue(true);
    openReview.mockResolvedValue({ target: ReviewTarget.BUILT_IN_WINDOW });

    await open()('toolu_1');

    expect(adapterOpenDiff).not.toHaveBeenCalled();
  });
});
