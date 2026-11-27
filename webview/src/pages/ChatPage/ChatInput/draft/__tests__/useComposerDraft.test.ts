import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { emptyContent, type ComposerContent } from '@/shared';
import { useComposerDraft, type HistorySlot } from '../useComposerDraft';
import { composerDraftStore, NEW_SESSION_DRAFT, type DraftChannel } from '../composerDraftStore';
import { MessageType, type ComposerDraft } from '@/shared';

/** A backend that holds what it is sent and tells what the test says another window did. */
class FakeBackend implements DraftChannel {
  stored = new Map<string, { draft: ComposerDraft; editedAt: number }>();
  pictures: Record<string, string> = {};
  saves: Record<string, unknown>[] = [];
  down = false;
  private clock = 100;
  private heard: ((message: { payload?: Record<string, unknown> }) => void)[] = [];

  send = async <T,>(type: MessageType, payload: Record<string, unknown>): Promise<T> => {
    if (this.down) throw new Error('not connected');
    const sessionId = payload.sessionId as string;
    if (type === MessageType.SAVE_COMPOSER_DRAFT) {
      this.saves.push(payload);
      const editedAt = ++this.clock;
      const draft = payload.draft as ComposerDraft;
      if (draft.content.text === '' && Object.keys(draft.edits).length === 0) this.stored.delete(sessionId);
      else this.stored.set(sessionId, { draft, editedAt });
      return { status: 'ok', editedAt } as T;
    }
    const stored = this.stored.get(sessionId);
    return { status: 'ok', draft: stored?.draft ?? null, editedAt: stored?.editedAt ?? 0, blobs: this.pictures } as T;
  };

  subscribe = (_type: MessageType, handler: (message: { payload?: Record<string, unknown> }) => void) => {
    this.heard.push(handler);
    return () => { this.heard = this.heard.filter((h) => h !== handler); };
  };

  /** Another window kept this text. */
  elsewhere(sessionId: string, text: string) {
    const editedAt = ++this.clock;
    const draft: ComposerDraft = { content: written(text), edits: {} };
    this.stored.set(sessionId, { draft, editedAt });
    this.heard.forEach((h) => h({ payload: { sessionId, draft, editedAt } }));
  }
}

let backend = new FakeBackend();

const written = (text: string): ComposerContent => ({ ...emptyContent(), text });
const send = (key: string, text: string): HistorySlot => ({ key, original: written(text) });

/** The composer: its content is state, and the hook puts contents into it the way ChatInput does. */
function composer(initial: { sessionId?: string | null; text?: string; handoff?: ComposerContent | null } = {}) {
  const handoff = initial.handoff ?? null;
  return renderHook(
    ({ sessionId }: { sessionId: string | null }) => {
      const [content, setContent] = useState(written(initial.text ?? ''));
      const [slot, setSlot] = useState<HistorySlot | null>(null);
      const draft = useComposerDraft({ sessionId, workingDirectory: '/w', channel: backend, content, apply: setContent, slot, handoff });
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
    backend = new FakeBackend();
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

  it('gives up one edit, and shows the send as sent when it is the one on screen', () => {
    const { result } = composer();
    walk(result, send('u1', 'first'));
    type(result, 'first, changed');
    walk(result, send('u2', 'second'));
    type(result, 'second, changed');

    act(() => result.current.draft.revert('u1'));
    expect(Object.keys(draftOf('s1').edits)).toEqual(['u2']);
    expect(shown(result)).toBe('second, changed');

    act(() => result.current.draft.revert('u2'));
    expect(draftOf('s1').edits).toEqual({});
    expect(shown(result)).toBe('second');
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

describe('the draft the backend keeps', () => {
  beforeEach(() => {
    composerDraftStore.clear();
    backend = new FakeBackend();
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  /** Let the answers of the backend arrive, and the rest after typing pass. */
  const settle = async (ms = 500) => {
    await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  };

  it('is sent once the box rests, with the folder of the session', async () => {
    vi.useFakeTimers();
    const { result } = composer();
    await settle();

    type(result, 'a');
    type(result, 'ab');
    await settle();

    expect(backend.saves).toHaveLength(1);
    expect(backend.saves[0]).toMatchObject({ workingDir: '/w', sessionId: 's1', draft: { content: { text: 'ab' } } });
  });

  it('is shown when the session is opened with nothing held here', async () => {
    vi.useFakeTimers();
    backend.stored.set('s1', { draft: { content: written('from before the restart'), edits: {} }, editedAt: 50 });

    const { result } = composer();
    await settle();

    expect(shown(result)).toBe('from before the restart');
    expect(backend.saves).toEqual([]);
  });

  it('shows what another window keeps while this box rests', async () => {
    vi.useFakeTimers();
    const { result } = composer();
    await settle();

    act(() => backend.elsewhere('s1', 'typed in the other window'));

    expect(shown(result)).toBe('typed in the other window');
  });

  it('never replaces what is being typed here and not yet sent', async () => {
    vi.useFakeTimers();
    const { result } = composer();
    await settle();

    type(result, 'being typed here');
    act(() => backend.elsewhere('s1', 'older, from the other window'));

    expect(shown(result)).toBe('being typed here');
    await settle();
    expect(backend.stored.get('s1')?.draft.content.text).toBe('being typed here');
  });

  it('waits behind the walk: another window\'s draft is shown on the way back down', async () => {
    vi.useFakeTimers();
    const { result } = composer();
    await settle();
    walk(result, send('u1', 'sent'));

    act(() => backend.elsewhere('s1', 'newer draft'));
    expect(shown(result)).toBe('sent');
    walk(result, null);

    expect(shown(result)).toBe('newer draft');
  });

  it('empties the box when the draft was sent from another window', async () => {
    vi.useFakeTimers();
    const view = composer();
    await settle();
    type(view.result, 'written here');
    await settle();

    backend.stored.delete('s1');
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();

    expect(shown(view.result)).toBe('');
  });

  it('keeps what was typed while the backend was away and sends it on coming back', async () => {
    vi.useFakeTimers();
    const { result } = composer();
    await settle();
    backend.down = true;

    type(result, 'offline words');
    await settle();
    backend.down = false;
    act(() => { window.dispatchEvent(new Event('focus')); });
    await settle();

    expect(shown(result)).toBe('offline words');
    expect(backend.stored.get('s1')?.draft.content.text).toBe('offline words');
  });

  it('moves a draft an earlier version left in the browser to the backend, and forgets the old one', async () => {
    vi.useFakeTimers();
    localStorage.setItem('claude-gui:draft:s1', 'left behind');

    composer();
    await settle();

    expect(backend.stored.get('s1')?.draft.content.text).toBe('left behind');
    expect(localStorage.getItem('claude-gui:draft:s1')).toBeNull();
  });
});
