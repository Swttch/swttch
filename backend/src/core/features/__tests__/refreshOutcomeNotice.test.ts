/**
 * What the IDE's diff is told after a refresh it asked for (#359).
 *
 * The case this exists for: the reviewer typed over line 5 AND edited line 5 in
 * the file, so the Edit's `old_string` is no longer in it and the proposal
 * cannot be restated. The refresh returned unrebuildable and the IDE path said
 * nothing at all — the banner still read "Refresh to see the current file and
 * decide again", pressing Refresh did nothing visible, and Apply stayed held.
 * A dead end with no explanation, measured in QA.
 *
 * The built-in surface already restates its banner in that case. These pin that
 * the IDE path reaches the same three answers.
 */
import { describe, it, expect } from 'vitest';
import { refreshOutcomeNotice } from '../refreshOutcomeNotice';
import type { StoredPreview } from '../diffPreview';

const preview = (over: Partial<StoredPreview> = {}): StoredPreview => ({
  filePath: '/tmp/index_js.php',
  oldContent: 'line 1\nline 5 on disk\n',
  newContent: 'line 1\nline 5 CLAUDE\n',
  hunks: [],
  input: {},
  toolName: 'Edit',
  ...over,
});

describe('refreshOutcomeNotice', () => {
  it('redraws with the merged proposal, not the raw rebuild', () => {
    const notice = refreshOutcomeNotice(
      { status: 'refreshed', preview: preview() },
      'line 1\nline 5 CLAUDE22\n',
    );

    expect(notice).toEqual({
      kind: 'redraw',
      filePath: '/tmp/index_js.php',
      oldContent: 'line 1\nline 5 on disk\n',
      // The reviewer's typing, which is the whole point of merging first.
      newContent: 'line 1\nline 5 CLAUDE22\n',
    });
  });

  /**
   * The reported dead end. Saying nothing here is what left the reviewer with a
   * banner that asked them to do something that could not work.
   */
  it('asks for a banner when the edit no longer fits the file', () => {
    const notice = refreshOutcomeNotice(
      { status: 'unrebuildable', reason: 'no-longer-applies' },
      '',
    );

    expect(notice).toEqual({ kind: 'banner', reason: 'no-longer-applies' });
  });

  /**
   * Distinct from the above on purpose: telling someone their file cannot be
   * read when it is perfectly readable sends them looking for a problem that
   * does not exist.
   */
  it('keeps unreadable distinct from no-longer-applies', () => {
    const notice = refreshOutcomeNotice({ status: 'unrebuildable', reason: 'unreadable' }, '');

    expect(notice).toEqual({ kind: 'banner', reason: 'unreadable' });
  });

  it('says nothing when the review is already current', () => {
    expect(refreshOutcomeNotice({ status: 'unchanged', preview: preview() }, '')).toEqual({
      kind: 'none',
    });
  });

  it('says nothing about a review that no longer exists', () => {
    expect(refreshOutcomeNotice({ status: 'unknown' }, '')).toEqual({ kind: 'none' });
  });
});
