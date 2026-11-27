import { AbstractEntity } from '../AbstractEntity';
import { Column, RawRow } from '../Column';

/**
 * The composer draft of one session (`composer_drafts`): the message being written and the edits made to sends
 * recalled from the history (#735). At most one row per session; a session with nothing written has none.
 */
export class ComposerDraft extends AbstractEntity {
  static readonly COLUMNS = AbstractEntity.columnsWith(
    new Column('sessionId', 'string'),
    new Column('editedAt', 'number'),
    new Column('body', 'string'),
  );

  constructor(
    id: number,
    projectId: number | null,
    /** The session, as the CLI names it. */
    public sessionId: string,
    /** When the backend received this version, in epoch milliseconds. The later one wins. */
    public editedAt: number,
    /** The draft (`ComposerDraft` in shared/) as JSON. Picture bytes are not in it: see `composerDraftBlobs`. */
    public body: string,
  ) {
    super(id, projectId);
  }

  /** A row that has not been inserted yet, so it has no number. */
  static draft(projectId: number | null, sessionId: string, editedAt: number, body: string): ComposerDraft {
    return new ComposerDraft(0, projectId, sessionId, editedAt, body);
  }

  static fromRow(row: RawRow): ComposerDraft {
    return new ComposerDraft(
      row.int('id'),
      row.nullableInt('projectId'),
      row.string('sessionId'),
      row.number('editedAt'),
      row.string('body'),
    );
  }

  get columns(): readonly Column[] {
    return ComposerDraft.COLUMNS;
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      sessionId: this.sessionId,
      editedAt: this.editedAt,
      body: this.body,
    };
  }
}
