import { AbstractEntityCollection, EntityChange } from '../AbstractEntityCollection';
import { RawRow } from '../Column';
import { defaultTableMetadata } from '../defaultTableMetadata';
import { ComposerDraft } from './ComposerDraft.entity';

export class ComposerDraftCollection extends AbstractEntityCollection<ComposerDraft> {
  readonly domain = 'composer';
  readonly table = 'composer_drafts';
  protected readonly columns = ComposerDraft.COLUMNS;
  protected readonly schemaVersion = 1;

  constructor() {
    super(defaultTableMetadata());
  }

  protected hydrate(row: RawRow): ComposerDraft {
    return ComposerDraft.fromRow(row);
  }

  async ofSession(sessionId: string): Promise<ComposerDraft | null> {
    return (await this.where((row) => row.sessionId === sessionId))[0] ?? null;
  }

  /** Put the draft of a session in place of the one it has, or add it. */
  async put(draft: ComposerDraft): Promise<void> {
    const replaced = await this.mutate((rows) => {
      const stored = rows.find((row) => row.sessionId === draft.sessionId);
      if (!stored) return EntityChange.keep(rows, false);
      stored.projectId = draft.projectId;
      stored.editedAt = draft.editedAt;
      stored.body = draft.body;
      return EntityChange.write(rows, true);
    });
    if (replaced) return;
    await this.insertMissing([draft], (stored, candidate) => stored.sessionId === candidate.sessionId);
  }

  async deleteOfSession(sessionId: string): Promise<void> {
    await this.mutate((rows) => {
      const kept = rows.filter((row) => row.sessionId !== sessionId);
      return kept.length === rows.length ? EntityChange.keep(rows, undefined) : EntityChange.write(kept, undefined);
    });
  }
}
