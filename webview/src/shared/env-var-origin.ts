/**
 * Where a user set an environment variable.
 *
 * **Never carries the value.** Telling someone their key sits in `~/.zshrc:42` is the
 * help they need; echoing the key itself into a chat transcript that gets pasted into
 * bug reports is not.
 */
export interface EnvVarOrigin {
  /** Which kind of place this is, so the UI can phrase it for a non-developer. */
  kind: 'claude-settings' | 'plugin-settings' | 'shell-file' | 'dotenv' | 'system-file';
  /** Path of the file, with the home directory written as `~`. */
  path: string;
  /** 1-based line number of the assignment. */
  line: number;
}
