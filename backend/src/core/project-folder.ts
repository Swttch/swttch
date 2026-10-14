import { stat } from 'fs/promises';
import { resolveWslCwd } from './wsl-path';

/** How long a folder is given to answer before it is taken to be there. */
const FOLDER_ANSWER_TIMEOUT_MS = 2_000;

/**
 * Whether a project's folder is no longer there. A folder on a deleted WSL
 * distribution, an unmounted drive or a dropped network share does not answer "no
 * such file" (`ENOENT`): Windows answers `ECONNRESET` or `UNKNOWN`. None of those
 * is anything the user can allow, so only a refusal for lack of permission (`EACCES`,
 * `EPERM`) is not "gone".
 *
 * A folder that has not answered within [FOLDER_ANSWER_TIMEOUT_MS] (a share that has
 * stalled) is not called gone either: it may come back, and calling it gone would
 * tell the user to give up on a project that is still theirs.
 *
 * The folder is looked at where the CLI will be started in it. A backend inside a WSL
 * distribution is handed the Windows UNC path the IDE knows the project by, which names
 * nothing to a Linux process, so it is asked about the Linux path that path points to
 * (#561).
 */
export async function isFolderGone(folder: string): Promise<boolean> {
  const where = resolveWslCwd(folder) as string;
  let timer: NodeJS.Timeout | undefined;
  const answer = stat(where).then(
    (stats) => !stats.isDirectory(),
    (err: NodeJS.ErrnoException) => err.code !== 'EACCES' && err.code !== 'EPERM',
  );
  const silence = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), FOLDER_ANSWER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([answer, silence]);
  } finally {
    clearTimeout(timer);
  }
}
