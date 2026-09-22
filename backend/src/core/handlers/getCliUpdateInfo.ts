import { realpathSync } from 'fs';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { Claude } from '../claude';
import { runLauncher } from '../run-launcher';
import { getCliVersion } from './getVersion';
import {
  detectPackageManager,
  updateModeFor,
  isCliUpdatable,
  parseDistTags,
  CLAUDE_NPM_PACKAGE,
} from '../cli-update';
import { MessageType, PackageManager, UpdateMode, type CliUpdateInfo } from '../../shared';

/**
 * Query npm's registry for the available dist-tag versions. The backend runs on
 * the user's machine, so node/npm exist; `npm view` is an official read command
 * (project philosophy: prefer documented CLI over private protocols).
 *
 * Run through [runLauncher], the SAME runner that installs and updates. Asking
 * and installing used to resolve npm two different ways, and only the installing
 * half carried the Windows workaround: `runLauncher` rewrites a bare `npm` to
 * `node <npm-cli.js>` when it can find the sibling script, while this function
 * called the `npm` launcher itself. Measured on Windows 11 with a GUI-launched
 * backend whose PATH holds no nodejs directory, the launcher at
 * `%APPDATA%\npm\npm` died with `exec: node: not found`, `latest` came back
 * null, and extend-kit-update.ts read that null as "nothing newer exists" — so
 * the kit sat on an old version indefinitely (#471). One runner, one resolution,
 * and the two halves cannot diverge again.
 *
 * `stdout` is parsed rather than the combined `output`, because npm writes
 * warnings on stderr and `npm view --json` writes JSON on stdout: mixed together
 * they are not parseable JSON.
 *
 * A failure answers null rather than throwing, since an unreachable registry is
 * not an error the caller can act on. It is logged, though: the silent null is
 * what made #471's stalled companion update invisible — 51 polls over 25 seconds
 * with the same version and not one line explaining why.
 */
export async function fetchDistTags(
  packageName: string = CLAUDE_NPM_PACKAGE,
): Promise<{ stable: string | null; latest: string | null }> {
  const args = ['view', packageName, 'dist-tags', '--json'];
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = await runLauncher(npm, args, { timeout: 15000, maxBuffer: 1024 * 1024 });
  if (!result.ok) {
    console.warn(`[dist-tags] ${packageName}: ${npm} ${args.join(' ')} failed\n`, result.output, '\n');
    return { stable: null, latest: null };
  }
  const tags = parseDistTags(result.stdout);
  if (!tags.latest) {
    console.warn(`[dist-tags] ${packageName}: no latest tag in the answer\n`, result.stdout, '\n');
  }
  return tags;
}

/** Resolve every path we know for the running `claude` binary (shim + realpath). */
export async function resolveClaudePaths(): Promise<Array<string | null>> {
  const whichPath = await Claude.which();
  let realPath: string | null = null;
  if (whichPath) {
    try {
      realPath = realpathSync(whichPath);
    } catch {
      realPath = null;
    }
  }
  return [whichPath, realPath];
}

export async function getCliUpdateInfoHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  try {
    const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
    const paths = await resolveClaudePaths();
    const packageManager = detectPackageManager(paths, home);
    const updateMode = updateModeFor(packageManager);

    // Skip the registry round-trip when nothing is updatable anyway.
    const [cliVersion, tags] = await Promise.all([
      getCliVersion(),
      updateMode === UpdateMode.NONE
        ? Promise.resolve({ stable: null, latest: null })
        : fetchDistTags(),
    ]);

    const info: CliUpdateInfo = {
      cliVersion,
      packageManager,
      updateMode,
      stable: tags.stable,
      latest: tags.latest,
      updatable: isCliUpdatable(updateMode, cliVersion, tags.latest),
    };

    console.log('claude update info\n', JSON.stringify({ ...info, paths }), '\n');

    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'ok',
      ...info,
    });
  } catch (err) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      packageManager: PackageManager.UNKNOWN,
      updateMode: UpdateMode.NONE,
      updatable: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
