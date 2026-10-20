/**
 * Options for a child process that is only here to print to a pipe.
 *
 * On Windows a console program (`git.exe`, `where.exe`, `reg.exe`, `bash.exe`,
 * `taskkill.exe`, ...) that Node starts gets a console of its own, and that console is a
 * visible window unless the spawn says otherwise. Node's default is
 * `windowsHide: false`, so every such call can flash a black window over the IDE while the
 * user types (#539). The flag is a no-op on macOS and Linux and inside WSL.
 *
 * Every spawn that captures output goes through here, so the flag is written once and a
 * new call site cannot forget it.
 *
 * `windowsHide` hides a GUI window as well as a console. Do NOT use this for a spawn whose
 * whole purpose is to put a window in front of the user (a terminal, an editor, a folder
 * dialog).
 *
 * `windowsHide` is set after the caller's options on purpose: a caller cannot switch it
 * back off by accident.
 */
export function consoleSafeExecOptions(): { windowsHide: true };
export function consoleSafeExecOptions<T extends object>(
  options: T | undefined,
): T & { windowsHide: true };
export function consoleSafeExecOptions(options?: object): object {
  return { ...options, windowsHide: true };
}
