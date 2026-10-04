import { homedir } from 'os';
import { ProjectCollection } from '../project/Project.collection';

/** What a migration reports when it is done. */
export class MigrationReport {
  constructor(
    /** What it did, in a sentence for a person. Recorded with the migration. */
    readonly summary: string,
    /**
     * Directories whose old files could not be read for lack of permission. The run
     * is not held up by them; the user is told which they are and how to allow them.
     */
    readonly unreadable: string[] = [],
  ) {}
}

/** What a migration may use besides the entity collections. */
export class MigrationContext {
  /**
   * The projects the program knows of by the time the migration runs: the ones a
   * migration that looks for old files inside every project has to visit.
   */
  readonly projects = new ProjectCollection();

  constructor(
    /**
     * The home folder the old stores sit under (`<home>/.claude-code-gui/...`). The
     * user's own home unless a test points it elsewhere.
     */
    readonly legacyHome: string = homedir(),
  ) {}
}

/**
 * One step in moving the user's data from the shape an older version wrote to the
 * shape this one reads.
 *
 * A migration is a file in `core/migrations/`, named `<timestamp>_<what-it-does>`,
 * holding one class that extends this one. Files run in the order of their names,
 * each once: a name with no record in `system_migrations` is a migration that has
 * not run yet. There is no way back. The old data is left where it was, so going
 * back to an older version finds it exactly as it was.
 *
 * What a migration may rely on:
 *
 * - It runs before any request reads or writes an entity, and alone among the
 *   processes that share the data directory.
 * - It may be run again from the start after a crash, so everything it writes must
 *   be safe to write twice.
 * - Throwing stops the run. It is recorded as not done, and the next start tries it
 *   again, along with everything after it.
 */
export abstract class Migration {
  abstract up(context: MigrationContext): Promise<MigrationReport>;

  /**
   * Read again the folders [up] reported as unreadable, and move what they hold.
   * Answers the folders that are STILL unreadable. A migration that can report
   * unreadable folders overrides this; for one that cannot, every folder stays.
   *
   * Called after the migration is recorded, whenever the program has a good moment:
   * the user opens that project's prompts, the window is active again, the backend
   * starts. So it must be as safe to run again as [up] is, and cheap when nothing
   * has changed.
   */
  async retry(_context: MigrationContext, folders: string[]): Promise<string[]> {
    return folders;
  }
}
