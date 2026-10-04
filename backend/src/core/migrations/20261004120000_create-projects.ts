import { Migration, MigrationContext, MigrationReport } from '../entities/migration/Migration';
import { syncProjectsList } from '../features/syncProjectsList';
import { Claude } from '../claude';

/**
 * Fills the `projects` table with every working directory the CLI has recorded
 * sessions in, so that the migrations after this one (and the project list) start
 * from a table that already knows the directories the user has been working in.
 *
 * Nothing is moved and nothing is deleted: the CLI's records are read, and the
 * table is brought up to date with them the same way the project list does it every
 * time it is opened.
 */
export default class CreateProjects extends Migration {
  async up(_context: MigrationContext): Promise<MigrationReport> {
    // The project list is read from the profile that holds every project, which is
    // the global one. A start-up has not been asked for any project yet, so nothing
    // else has settled which profile that is.
    await Claude.applyConfigDir();
    const projects = await syncProjectsList();
    return new MigrationReport(`registered ${projects.length} projects`);
  }
}
