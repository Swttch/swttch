import { MessageType, blobIdsOf, emptyDraft, isEmptyDraft, type ComposerContent, type ComposerDraft } from '@/shared';

/** How long the box rests before what was written is sent to the backend. */
const SAVE_DELAY_MS = 400;

/** The part of the bridge the drafts travel over. */
export interface DraftChannel {
  send: <T>(type: MessageType, payload: Record<string, unknown>) => Promise<T>;
  subscribe: (type: MessageType, handler: (message: { payload?: Record<string, unknown> }) => void) => () => void;
}

interface LoadedDraft {
  status?: string;
  draft?: ComposerDraft | null;
  editedAt?: number;
  blobs?: Record<string, string>;
}

/** Where a session's draft stands against the backend's. */
interface Sync {
  workingDir: string;
  /** The backend's time of the version this window holds, 0 while it has seen none. */
  editedAt: number;
  /** Changed here since it was last kept by the backend. Nothing from elsewhere replaces it then. */
  dirty: boolean;
  timer?: ReturnType<typeof setTimeout>;
  saving?: Promise<void>;
  /** The pictures the backend holds already. */
  sent: Set<string>;
}

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
 *
 * This is the window's cache, shown the moment a draft is asked for. The backend keeps the same draft, so it survives
 * a restart and other windows show it: what is changed here is sent after a short rest, and a draft from the backend
 * takes the place of this one when it is the later one and nothing here is waiting to be sent.
 */
export class ComposerDraftStore {
  private drafts = new Map<string, ComposerDraft>();
  /** The bytes of pictures, by attachment id: a draft only names them. */
  private pictures = new Map<string, string>();
  /** The text the composer of each session showed last, to tell what was written while it was not on screen. */
  private shownTexts = new Map<string, string>();
  private listeners = new Set<() => void>();
  private replacedListeners = new Set<(sessionId: string) => void>();
  private syncs = new Map<string, Sync>();
  private channel: DraftChannel | null = null;
  private unsubscribe: (() => void) | null = null;

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
    const sync = this.syncs.get(sessionId);
    if (!sync) return;
    sync.dirty = true;
    this.saveSoon(sessionId, sync);
  }

  /** The way to the backend. Given once; a later one takes its place. */
  connect(channel: DraftChannel): void {
    if (this.channel === channel) return;
    this.unsubscribe?.();
    this.channel = channel;
    this.unsubscribe = channel.subscribe(MessageType.COMPOSER_DRAFT_CHANGED, (message) => {
      const { sessionId, draft, editedAt } = (message.payload ?? {}) as { sessionId?: string; draft?: ComposerDraft; editedAt?: number };
      if (sessionId && draft && editedAt) this.receive(sessionId, draft, editedAt);
    });
  }

  /** A session's draft is on screen: ask the backend for it, and keep it up to date from here on. */
  async open(sessionId: string, workingDir: string): Promise<void> {
    if (sessionId === NEW_SESSION_DRAFT || !this.channel) return;
    let sync = this.syncs.get(sessionId);
    if (!sync) {
      sync = { workingDir, editedAt: 0, dirty: false, sent: new Set() };
      this.syncs.set(sessionId, sync);
    }
    sync.workingDir = workingDir;
    // Something here is still on its way to the backend: it is the later one.
    if (sync.dirty) {
      this.saveSoon(sessionId, sync);
      return;
    }
    const answer = await this.read(sessionId);
    if (!answer || sync.dirty) return;
    if (answer.draft) {
      if ((answer.editedAt ?? 0) > sync.editedAt) this.take(sessionId, sync, answer.draft, answer.editedAt ?? 0);
    } else if (sync.editedAt > 0) {
      // The backend had it and has it no longer: it was sent from another window.
      this.take(sessionId, sync, emptyDraft(), 0);
    } else if (!isEmptyDraft(this.get(sessionId))) {
      // Only this window has it (written before the backend was reached, or left by an earlier version).
      this.change(sessionId, this.get(sessionId));
    }
    this.forgetLegacy(sessionId);
  }

  /** Send what is waiting now, without the rest the box is given (the page is going away). */
  flush(): void {
    for (const [sessionId, sync] of this.syncs) if (sync.dirty) void this.save(sessionId, sync);
  }

  /** Be told when a session's draft was replaced by one from elsewhere, so the box can show it. */
  onReplaced(listener: (sessionId: string) => void): () => void {
    this.replacedListeners.add(listener);
    return () => this.replacedListeners.delete(listener);
  }

  private receive(sessionId: string, draft: ComposerDraft, editedAt: number): void {
    const sync = this.syncs.get(sessionId);
    // A session never opened here is read when it is opened.
    if (!sync || sync.dirty || editedAt <= sync.editedAt) return;
    if (blobIdsOf(draft).some((id) => !this.pictures.has(id))) {
      void this.read(sessionId).then((answer) => {
        if (answer?.draft && !sync.dirty && (answer.editedAt ?? 0) > sync.editedAt) {
          this.take(sessionId, sync, answer.draft, answer.editedAt ?? 0);
        }
      });
      return;
    }
    this.take(sessionId, sync, draft, editedAt);
  }

  private take(sessionId: string, sync: Sync, draft: ComposerDraft, editedAt: number): void {
    sync.editedAt = editedAt;
    for (const id of blobIdsOf(draft)) sync.sent.add(id);
    this.put(sessionId, draft);
    this.replacedListeners.forEach((listener) => listener(sessionId));
  }

  private async read(sessionId: string): Promise<LoadedDraft | null> {
    try {
      const answer = await this.channel!.send<LoadedDraft>(MessageType.GET_COMPOSER_DRAFT, { sessionId, have: [...this.pictures.keys()] });
      if (answer?.status !== 'ok') return null;
      for (const [id, data] of Object.entries(answer.blobs ?? {})) this.pictures.set(id, data);
      return answer;
    } catch {
      // Not reached: the draft held here stands, and the next open asks again.
      return null;
    }
  }

  private saveSoon(sessionId: string, sync: Sync): void {
    clearTimeout(sync.timer);
    sync.timer = setTimeout(() => void this.save(sessionId, sync), SAVE_DELAY_MS);
  }

  private async save(sessionId: string, sync: Sync): Promise<void> {
    clearTimeout(sync.timer);
    // One save of a session at a time, so a later one is never overtaken.
    if (sync.saving) {
      await sync.saving;
      if (!sync.dirty) return;
    }
    const draft = this.get(sessionId);
    const fresh = blobIdsOf(draft).filter((id) => !sync.sent.has(id) && this.pictures.has(id));
    const run = (async () => {
      try {
        const answer = await this.channel!.send<{ status?: string; editedAt?: number }>(MessageType.SAVE_COMPOSER_DRAFT, {
          workingDir: sync.workingDir,
          sessionId,
          draft,
          blobs: Object.fromEntries(fresh.map((id) => [id, this.pictures.get(id)!])),
        });
        if (answer?.status !== 'ok') return;
        sync.editedAt = answer.editedAt ?? sync.editedAt;
        // The backend keeps only the pictures the draft names.
        sync.sent = new Set(blobIdsOf(draft));
        if (this.get(sessionId) === draft) sync.dirty = false;
        // An emptied draft is gone from the backend, as is every picture it had.
        if (isEmptyDraft(draft)) sync.editedAt = 0;
      } catch {
        // Not reached: still waiting to be sent, with the next change or the next time the session is opened.
      }
    })();
    sync.saving = run;
    await run;
    if (sync.saving === run) sync.saving = undefined;
  }

  /** Replace a draft without it counting as a change of this window's. */
  private put(sessionId: string, draft: ComposerDraft): void {
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
    for (const sync of this.syncs.values()) clearTimeout(sync.timer);
    this.syncs.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.channel = null;
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
  private forgetLegacy(sessionId: string): void {
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
