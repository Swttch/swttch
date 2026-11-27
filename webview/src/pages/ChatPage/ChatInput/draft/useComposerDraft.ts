import { useCallback, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { emptyContent, emptyDraft, isEmptyContent, sameContent, type ComposerContent } from '@/shared';
import { composerDraftStore, NEW_SESSION_DRAFT, type DraftChannel } from './composerDraftStore';

/** The send of the history the composer shows, with the send as it was sent; null while it shows the draft. */
export interface HistorySlot {
  key: string;
  original: ComposerContent;
}

interface Args {
  sessionId: string | null;
  workingDirectory: string | null;
  /** The way to the backend, which keeps the draft of every session. */
  channel: DraftChannel;
  /** What the composer holds now. */
  content: ComposerContent;
  /** Put a content in the composer. */
  apply: (content: ComposerContent) => void;
  slot: HistorySlot | null;
  /** What the screen that opened this session asks to have in the composer: the send a fork was made before (#719). */
  handoff: ComposerContent | null;
}

/** The handoffs already put in a composer, so that coming back to the session does not bring one back. */
const takenHandoffs = new Set<string>();

/**
 * Ties the composer to its draft (#735).
 *
 * What the person does to the composer goes to the draft, or, while it shows a send of the history, to that send's own
 * edit. Whatever this hook puts in the composer itself changes nothing.
 */
export function useComposerDraft({ sessionId, workingDirectory, channel, content, apply, slot, handoff }: Args) {
  const key = sessionId ?? NEW_SESSION_DRAFT;
  const draft = useSyncExternalStore(composerDraftStore.subscribe, () => composerDraftStore.get(key));

  /** What this hook last put in the composer, or last took from it. */
  const heldRef = useRef<ComposerContent | null>(null);
  /** The content of the render before, to tell a change of the composer from a render that changed nothing in it. */
  const previousRef = useRef(content);
  const mountedRef = useRef(false);

  const applyRef = useRef(apply);
  applyRef.current = apply;
  const contentRef = useRef(content);
  contentRef.current = content;

  const put = useCallback((next: ComposerContent) => {
    heldRef.current = next;
    applyRef.current(next);
  }, []);

  // Arriving at a session, and coming back on screen: the box gets the session's draft.
  useLayoutEffect(() => {
    const current = composerDraftStore.get(key);
    if (handoff && !takenHandoffs.has(key) && isEmptyContent(current.content)) {
      takenHandoffs.add(key);
      composerDraftStore.change(key, { ...current, content: handoff });
      put(handoff);
    } else {
      const shown = composerDraftStore.shownText(key);
      const typed = contentRef.current.text;
      // Written into the box while it was not on screen (dictation goes on under a card): that text is the newest.
      if (!mountedRef.current && shown !== undefined && typed !== '' && typed !== shown) {
        const kept = { ...current.content, text: typed };
        composerDraftStore.change(key, { ...current, content: kept });
        put(kept);
      } else {
        put(current.content);
      }
    }
    mountedRef.current = true;
    // `handoff` belongs to the navigation that changed `key`; a later change of it is not a new arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, put]);

  // What the person did to the box.
  const slotRef = useRef(slot);
  slotRef.current = slot;
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = content;
    composerDraftStore.setShownText(key, content.text);
    if (sameContent(previous, content)) return;
    if (heldRef.current && sameContent(heldRef.current, content)) return;
    heldRef.current = content;

    const current = composerDraftStore.get(key);
    const at = slotRef.current;
    if (!at) {
      composerDraftStore.change(key, { ...current, content });
      return;
    }
    const edits = { ...current.edits };
    // Changed back to what was sent is not an edit.
    if (sameContent(content, at.original)) delete edits[at.key];
    else edits[at.key] = content;
    composerDraftStore.change(key, { ...current, edits });
  }, [key, content]);

  // The backend's copy: asked for when the session is opened and when the window is come back to, and shown when it
  // is the later one. What another window keeps arrives by itself.
  useEffect(() => {
    if (!workingDirectory) return;
    composerDraftStore.connect(channel);
    const open = () => void composerDraftStore.open(key, workingDirectory);
    open();
    const flush = () => composerDraftStore.flush();
    window.addEventListener('focus', open);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('focus', open);
      window.removeEventListener('pagehide', flush);
    };
  }, [key, workingDirectory, channel]);

  useEffect(
    () =>
      composerDraftStore.onReplaced((replaced) => {
        if (replaced !== key) return;
        const current = composerDraftStore.get(key);
        const at = slotRef.current;
        put(at ? current.edits[at.key] ?? at.original : current.content);
      }),
    [key, put],
  );

  /** Show a send of the history, as edited if it was, or the draft when `next` is null. */
  const show = useCallback((next: HistorySlot | null) => {
    const current = composerDraftStore.get(key);
    const wanted = next ? current.edits[next.key] ?? next.original : current.content;
    // Known before the composer has caught up, so the change it is about to show is not taken for the person's.
    slotRef.current = next;
    put(wanted);
    return wanted;
  }, [key, put]);

  /**
   * A message was sent: every edit goes, and so does the draft when it was the draft that was sent. A draft left
   * waiting while a send of the history was sent comes back into the box.
   */
  const sent = useCallback((fromHistory: boolean) => {
    const current = composerDraftStore.get(key);
    const kept = fromHistory ? current.content : emptyContent();
    composerDraftStore.change(key, fromHistory ? { content: kept, edits: {} } : emptyDraft());
    slotRef.current = null;
    if (fromHistory) put(kept);
    else heldRef.current = kept;
  }, [key, put]);

  const hasDraft = !isEmptyContent({ ...draft.content, text: draft.content.text.trim() });
  /** Whether the send shown reads as changed with `text` in the box, ahead of the composer's value. */
  const isModifiedWith = (text: string) => slot !== null && !sameContent({ ...content, text }, slot.original);
  return { show, sent, hasDraft, isModified: slot !== null && draft.edits[slot.key] !== undefined, isModifiedWith };
}
