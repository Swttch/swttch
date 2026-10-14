/**
 * The error shown when a message cannot be sent because the project's folder is no
 * longer on disk. It is its own class so the banner can tell it from every other
 * service error by what it is, not by what its text happens to say.
 */
export class WorkingDirMissingError extends Error {
  constructor(
    /** The folder that is gone, as the backend knows it. */
    readonly workingDir: string,
    message: string,
  ) {
    super(message);
    this.name = 'WorkingDirMissingError';
  }
}
