/**
 * Choosing which surface draws a review (#359).
 *
 * The backend and the webview both used to decide this, each reading settings
 * of its own. The backend merged them for the session's working directory; the
 * webview merged them for whatever directory it had loaded, which was often
 * none. A project asking for the IDE's viewer therefore got the IDE's viewer
 * when the review opened by itself, and the built-in page when the reviewer
 * clicked the file name — two reviews of one edit, on screen together.
 *
 * Reading the same values in both places was tried first and did not fix it,
 * because the two sides were reading them for different directories. So the
 * decision lives here, one function, and every caller asks it.
 */
import { describe, it, expect } from 'vitest';
import { resolveReviewTarget, ReviewTarget } from '../diff-surface';

describe('resolveReviewTarget', () => {
  describe('with an IDE attached', () => {
    const attached = { ideAttached: true };

    it('sends a project asking for the IDE to the IDE viewer', () => {
      expect(resolveReviewTarget({ ...attached, diffSurface: 'ide' })).toBe(
        ReviewTarget.IDE_VIEWER,
      );
    });

    /**
     * The default, and the behaviour that shipped: a review with nothing
     * configured opens in the IDE's own viewer.
     */
    it('treats an unset surface as the IDE', () => {
      expect(resolveReviewTarget(attached)).toBe(ReviewTarget.IDE_VIEWER);
    });

    it('sends a project asking for the built-in page to an editor tab', () => {
      expect(resolveReviewTarget({ ...attached, diffSurface: 'built-in' })).toBe(
        ReviewTarget.BUILT_IN_TAB,
      );
    });

    it('honours an overlay when the chat has room for one', () => {
      const target = resolveReviewTarget({
        ...attached,
        diffSurface: 'built-in',
        browserDiffPresentation: 'overlay',
        hostMode: 'editor-tab',
      });

      expect(target).toBe(ReviewTarget.BUILT_IN_OVERLAY);
    });

    /**
     * An overlay inherits the space of whatever it covers, and a sidebar chat
     * is a column. A side-by-side diff laid over one would be unreadable in the
     * very surface it is meant to be read in, so the tab wins instead.
     */
    it('falls back to a tab when the chat is a sidebar', () => {
      const target = resolveReviewTarget({
        ...attached,
        diffSurface: 'built-in',
        browserDiffPresentation: 'overlay',
        hostMode: 'tool-window',
      });

      expect(target).toBe(ReviewTarget.BUILT_IN_TAB);
    });

    /**
     * Asking for the IDE's viewer outranks asking for an overlay: the overlay
     * setting describes how the BUILT-IN page appears, and the built-in page is
     * not what this project asked for.
     */
    it('ignores the overlay preference when the IDE viewer was asked for', () => {
      const target = resolveReviewTarget({
        ...attached,
        diffSurface: 'ide',
        browserDiffPresentation: 'overlay',
        hostMode: 'editor-tab',
      });

      expect(target).toBe(ReviewTarget.IDE_VIEWER);
    });
  });

  describe('with no IDE attached', () => {
    const detached = { ideAttached: false };

    /**
     * Naming the IDE cannot conjure one to draw in. Every host can draw the
     * built-in page, so it is the answer whenever there is no IDE to honour the
     * preference with.
     */
    it('never chooses the IDE viewer, even when the setting names it', () => {
      expect(resolveReviewTarget({ ...detached, diffSurface: 'ide' })).toBe(
        ReviewTarget.BUILT_IN_WINDOW,
      );
    });

    it('opens a window by default', () => {
      expect(resolveReviewTarget(detached)).toBe(ReviewTarget.BUILT_IN_WINDOW);
    });

    it('honours an overlay when one was asked for', () => {
      const target = resolveReviewTarget({
        ...detached,
        browserDiffPresentation: 'overlay',
      });

      expect(target).toBe(ReviewTarget.BUILT_IN_OVERLAY);
    });
  });
});
