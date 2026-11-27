import { emptyDraft, isEmptyDraft, type ComposerContent, type ComposerDraft } from '@/shared';

/** The draft of the session that does not exist yet. It stays in this window: it has no name another could ask for. */
export const NEW_SESSION_DRAFT = 'new';

const NEW_DRAFT_KEY = 'claude-gui:new-draft';
const legacyTextKey = (sessionId: string) => `claude-gui:draft:${sessionId}`;
const legacyRecipientKey = (sessionId: string) => `claude-gui:draft-recipient:${sessionId}`;

/**
 * The composer drafts this window holds (#735): the message being written in each session, and the sends recalled from
 * its history and changed. It lives outside the components, so a draft survives the composer being taken away for a
 * card and a session being left, and is on screen again at once.
 *
 * Only what the person does to the composer changes a draft. Walking the history shows other things in the same box
 * and leaves the draft as it is.
 */
export class ComposerDraftStore {
  private drafts = new Map<string, ComposerDraft>();
  /** The bytes of pictures, by attachment id: a draft only names them. */
  private pictures = new Map<string, string>();
  /** The text the composer of each session showed last, to tell what was written while it was not on screen. */
  private shownTexts = new Map<string, string>();
  private listeners = new Set<() => void>();

  /** The draft of a session, the same object until it changes. */
  get(sessionId: string): ComposerDraft {
    let draft = this.drafts.get(sessionId);
    if (!draft) {
      draft = this.restore(sessionId);
      this.drafts.set(sessionId, draft);
    }
    return draft;
  }

  /** The person changed the draft. */
  change(sessionId: string, draft: ComposerDraft): void {
    this.put(sessionId, draft);
  }

  /** Replace a draft without it counting as a change of this window's. */
  protected put(sessionId: string, draft: ComposerDraft): void {
    this.drafts.set(sessionId, draft);
    if (sessionId === NEW_SESSION_DRAFT) this.keepNewDraft(draft);
    this.listeners.forEach((listener) => listener());
  }

  picture(id: string): string | undefined {
    return this.pictures.get(id);
  }

  keepPicture(id: string, data: string): void {
    this.pictures.set(id, data);
  }

  shownText(sessionId: string): string | undefined {
    return this.shownTexts.get(sessionId);
  }

  setShownText(sessionId: string, text: string): void {
    this.shownTexts.set(sessionId, text);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Forget everything held: for tests. */
  clear(): void {
    this.drafts.clear();
    this.pictures.clear();
    this.shownTexts.clear();
  }

  private restore(sessionId: string): ComposerDraft {
    try {
      if (sessionId === NEW_SESSION_DRAFT) {
        const stored = sessionStorage.getItem(NEW_DRAFT_KEY);
        if (!stored) return emptyDraft();
        const { draft, pictures } = JSON.parse(stored) as { draft: ComposerDraft; pictures: Record<string, string> };
        for (const [id, data] of Object.entries(pictures)) this.pictures.set(id, data);
        return draft;
      }
      // A draft an earlier version left in this browser: its words, and the session they were addressed to.
      const text = localStorage.getItem(legacyTextKey(sessionId));
      if (!text) return emptyDraft();
      const recipient = JSON.parse(localStorage.getItem(legacyRecipientKey(sessionId)) ?? 'null') as ComposerContent['recipient'];
      const draft = emptyDraft();
      draft.content.text = text;
      if (recipient?.token && text.includes(recipient.token)) draft.content.recipient = recipient;
      return draft;
    } catch {
      return emptyDraft();
    }
  }

  /** The draft an earlier version left is dropped once ours holds it. */
  protected forgetLegacy(sessionId: string): void {
    try {
      localStorage.removeItem(legacyTextKey(sessionId));
      localStorage.removeItem(legacyRecipientKey(sessionId));
    } catch {
      // Storage may be unavailable; there is nothing to forget then.
    }
  }

  private keepNewDraft(draft: ComposerDraft): void {
    try {
      if (isEmptyDraft(draft)) {
        sessionStorage.removeItem(NEW_DRAFT_KEY);
        return;
      }
      const ids = [draft.content, ...Object.values(draft.edits)].flatMap((content) => content.attachments.map((a) => a.id));
      const pictures = Object.fromEntries(ids.flatMap((id) => (this.pictures.has(id) ? [[id, this.pictures.get(id)!]] : [])));
      sessionStorage.setItem(NEW_DRAFT_KEY, JSON.stringify({ draft, pictures }));
    } catch {
      // Too large for this storage: the draft stays in memory for as long as the page does.
    }
  }
}

export const composerDraftStore = new ComposerDraftStore();
