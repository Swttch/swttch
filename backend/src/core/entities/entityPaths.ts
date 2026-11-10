import { join } from 'path';
import { ccgHomeDir } from '../../config/ccg-home';

/**
 * Where entity files live: `~/.claude-code-gui/entities/`.
 *
 * `CCG_HOME` is honored because it is the documented override for the user-data
 * directory, and a user who set it expects every file of ours to follow. It is
 * read on each call rather than once at import, so a test (or a process that
 * sets it late) is not stuck with the value from the moment this module loaded.
 */
export function entitiesRoot(): string {
  return join(ccgHomeDir(), 'entities');
}
