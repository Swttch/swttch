import { homedir } from 'os';
import { join } from 'path';
import { MigrationContext } from '../entities/migration/Migration';
import { UnreadFolderRetry } from '../entities/migration/UnreadFolderRetry';
import { LEGACY_DIR_NAME } from '../migrations/20261004120200_import-legacy-prompts';
import { MIGRATIONS } from '../migrations/registry';
import { migrationStatus } from './migration-status';
import type { PromptScope } from './prompts';

/**
 * The one reader of unread folders in this process. The backend start, the prompt
 * library and the window coming back to the front all go through it, so two of them
 * at the same moment wait for each other and never move the same folder twice.
 */
export const unreadFolderRetry = new UnreadFolderRetry(MIGRATIONS, new MigrationContext(), (paths) =>
  migrationStatus.unreadFolders(paths),
);

/**
 * Read again the old prompt files that belong to what the user is about to look at:
 * the shared library for the global scope, that project's own file for a project.
 * A folder that was never unreadable costs one look at a small table.
 */
export function retryUnreadPromptFolders(scope: PromptScope, projectPath: string | undefined): Promise<void> {
  if (scope === 'project') return projectPath ? unreadFolderRetry.retryFolder(projectPath) : Promise.resolve();
  return unreadFolderRetry.retryFolder(join(homedir(), LEGACY_DIR_NAME));
}
