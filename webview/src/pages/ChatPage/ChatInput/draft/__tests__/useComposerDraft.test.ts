import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { emptyContent, type ComposerContent } from '@/shared';
import { useComposerDraft, type HistorySlot } from '../useComposerDraft';
import { composerDraftStore, NEW_SESSION_DRAFT } from '../composerDraftStore';

const written = (text: string): ComposerContent => ({ ...emptyContent(), text });
const send = (key: string, text: string): HistorySlot => ({ key, original: written(text) });

/** The composer: its content is state, and the hook puts contents into it the way ChatInput does. */
function composer(initial: { sessionId?: string | null; text?: string; handoff?: ComposerContent | null } = {}) {
  const handoff = initial.handoff ?? null;
  return renderHook(
    ({ sessionId }: { sessionId: string | null }) => {
      const [content, setContent] = useState(written(initial.text ?? ''));
      const [slot, setSlot] = useState<HistorySlot | null>(null);
      const draft = useComposerDraft({ sessionId, content, apply: setContent, slot, handoff });
      return {
        content,
        draft,
        type: (text: string) => setContent((was) => ({ ...was, text })),
        walk: (to: HistorySlot | null) => { draft.show(to); setSlot(to); },
        /** What pressing send does: the box is emptied, the walk ends, the draft is told. */
        send: () => { const fromHistory = slot !== null; setContent(emptyContent()); setSlot(null); draft.sent(fromHistory); },
      };
    },
    { initialProps: { sessionId: initial.sessionId === undefined ? 's1' : initial.sessionId } },
  );
}

type Composer = ReturnType<typeof composer>['result'];
const type = (result: Composer, text: string) => act(() => result.current.type(text));
const walk = (result: Composer, to: HistorySlot | null) => act(() => result.current.walk(to));
const shown = (result: Composer) => result.current.content.text;
const draftOf = (sessionId: string) => composerDraftStore.get(sessionId);

describe('useComposerDraft', () => {
  beforeEach(() => {
    composerDraftStore.clear();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps what is typed as the draft', () => {
    const { result } = composer();

    type(result, 'half a thought');

    expect(draftOf('s1').content.text).toBe('half a thought');
  });

  it('leaves the draft alone while the history is walked, and brings it back', () => {
    const { result } = composer();
    type(result, 'my draft');

    walk(result, send('u2', 'sent last'));
    expect(shown(result)).toBe('sent last');
    walk(result, send('u1', 'sent first'));
    expect(draftOf('s1').content.text).toBe('my draft');
    expect(draftOf('s1').edits).toEqual({});

    walk(result, null);
    expect(shown(result)).toBe('my draft');
  });

  it('keeps an edit with the send it was made to, and says the send was changed', () => {
    const { result } = composer();
    type(result, 'my draft');
    walk(result, send('u1', 'sent'));

    type(result, 'sent, changed');
    expect(result.current.draft.isModified).toBe(true);
    walk(result, null);
    expect(shown(result)).toBe('my draft');
    walk(result, send('u1', 'sent'));

    expect(shown(result)).toBe('sent, changed');
    expect(result.current.draft.isModified).toBe(true);
  });

  it('drops an edit that was changed back to what was sent', () => {
    const { result } = composer();
    walk(result, send('u1', 'sent'));
    type(result, 'sent!');

    type(result, 'sent');

    expect(draftOf('s1').edits).toEqual({});
    expect(result.current.draft.isModified).toBe(false);
  });

  it('keeps an edit that emptied the send', () => {
    const { result } = composer();
    walk(result, send('u1', 'sent'));

    type(result, '');

    expect(draftOf('s1').edits.u1.text).toBe('');
  });

  it('brings the draft back after a send of the history was sent, and drops every edit', () => {
    const { result } = composer();
    type(result, 'my draft');
    walk(result, send('u1', 'sent'));
    type(result, 'sent again');

    act(() => result.current.send());

    expect(shown(result)).toBe('my draft');
    expect(draftOf('s1')).toEqual({ content: written('my draft'), edits: {} });
  });

  it('empties the draft, and every edit, when the draft was sent', () => {
    const { result } = composer();
    walk(result, send('u1', 'sent'));
    type(result, 'changed');
    walk(result, null);
    type(result, 'the new message');

    act(() => result.current.send());

    expect(shown(result)).toBe('');
    expect(draftOf('s1')).toEqual({ content: emptyContent(), edits: {} });
  });

  it('puts each session\'s own draft in the box', () => {
    const view = composer();
    type(view.result, 'for one');

    view.rerender({ sessionId: 's2' });
    expect(shown(view.result)).toBe('');
    type(view.result, 'for two');
    view.rerender({ sessionId: 's1' });

    expect(shown(view.result)).toBe('for one');
    expect(draftOf('s2').content.text).toBe('for two');
  });

  it('puts the draft back when the composer comes back on screen', () => {
    const first = composer();
    type(first.result, 'before the card');
    first.unmount();

    const again = composer();

    expect(shown(again.result)).toBe('before the card');
  });

  it('keeps the draft, not the send being looked at, when the composer is taken away mid-walk', () => {
    const first = composer();
    type(first.result, 'my draft');
    walk(first.result, send('u1', 'sent'));
    first.unmount();

    // The box still holds the recalled text, as the shared input state does.
    const again = composer({ text: 'sent' });

    expect(shown(again.result)).toBe('my draft');
  });

  it('takes what was written into the box while it was off screen', () => {
    const first = composer();
    type(first.result, 'spoken so');
    first.unmount();

    const again = composer({ text: 'spoken so far' });

    expect(shown(again.result)).toBe('spoken so far');
    expect(draftOf('s1').content.text).toBe('spoken so far');
  });

  it('puts a handed over send in a session that has no draft, once', () => {
    const view = composer({ handoff: written('forked send') });
    expect(shown(view.result)).toBe('forked send');

    type(view.result, '');
    view.rerender({ sessionId: 's2' });
    view.rerender({ sessionId: 's1' });

    expect(shown(view.result)).toBe('');
  });

  it('keeps the draft of the session not yet started in this window', () => {
    const { result } = composer({ sessionId: null });

    type(result, 'first words');

    expect(draftOf(NEW_SESSION_DRAFT).content.text).toBe('first words');
    expect(sessionStorage.getItem('claude-gui:new-draft')).toContain('first words');
  });

  it('reads the draft an earlier version left in the browser', () => {
    localStorage.setItem('claude-gui:draft:s9', 'left behind');

    const { result } = composer({ sessionId: 's9' });

    expect(shown(result)).toBe('left behind');
  });
});
