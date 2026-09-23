import { spawn, spawnSync } from 'child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Real OS desktop notifications, raised by the backend through a bundled
 * notifier executable rather than an inline script.
 *
 * Why an executable: an `osascript -e 'display notification …'` banner cannot
 * carry a click action, so tapping it opens Script Editor instead of the IDE,
 * and the inline PowerShell toast it replaced ran without a registered
 * AppUserModelID. Both binaries live in ./vendor — see vendor/README.md for
 * provenance, licensing and the measurements behind the install step below.
 *
 * Every failure here is swallowed: a missing banner must never stop a session.
 */

/** What a caller asks the OS to show. */
export interface OsNotificationOptions {
  /** Bold first line of the banner. */
  title: string;
  /** Body line. Empty is allowed; the macOS notifier needs a non-empty value, so it gets a space. */
  body: string;
  /**
   * Identifier that replaces this sender's previous banner carrying the same
   * value, so one chat panel never stacks up a column of stale banners.
   */
  groupId?: string;
  /**
   * Label of the banner's one button, already translated by the caller.
   *
   * Its presence is what makes the notifier wait around to report what the user
   * did — see NOTIFIER_STAYS_FOR_CLICK. Without it the process exits the moment
   * the banner is on screen and a click reaches nobody.
   */
  clickActionTitle?: string;
  /**
   * How long the notifier waits for a click before giving up, in seconds.
   *
   * It has to give up eventually: the process stays alive the whole time, and a
   * banner nobody ever touches would otherwise leave one behind for the rest of
   * the session.
   */
  clickTimeoutSeconds?: number;
}

/**
 * Why the click is reported to us instead of handed to macOS.
 *
 * terminal-notifier can raise an app itself, with `-activate <bundle id>`, and
 * that is what this used to do. Two things are wrong with it:
 *
 *   - It activates `runningApplications(bundleID).firstObject`. A user with two
 *     IntelliJ windows open gets whichever one macOS lists first, not the one
 *     whose session finished.
 *   - It only works for a process macOS knows as that app. A sandbox IDE,
 *     launched by Gradle rather than from its .app, is `com.jetbrains.jbr.java`
 *     to macOS, so nothing is found and the click does nothing at all.
 *
 * Reporting the click back instead lets the IDE that actually raised the
 * notification bring itself forward, which is both exact and portable.
 *
 * The notifier only reports a click when BOTH hold (its `reportInteractiveResponse`):
 *   - the notification is interactive — it has `-action` or `-reply`; and
 *   - it carries NO click action of its own — no `-activate`, `-execute`, `-open`.
 *
 * Hence one `-action` button and no `-activate`. The button is a side effect of
 * the only way to keep the process listening.
 */
const NOTIFIER_STAYS_FOR_CLICK = true;

/** What the notifier prints when the user clicked the banner body. */
const MAC_RESPONSE_BODY_CLICKED = '@ACTIONCLICKED';
/** Printed when the banner was dismissed, and when nobody touched it in time. */
const MAC_RESPONSE_CLOSED = '@CLOSED';
const MAC_RESPONSE_TIMEOUT = '@TIMEOUT';

/**
 * Whether [outcome] means the user asked to be taken to the session.
 *
 * Both the body and the single button count: someone who clicks either one
 * wants the same thing. Dismissing or ignoring it does not.
 */
export function isClickToFocus(outcome: NotifierOutcome): boolean {
  if (process.platform === 'darwin') {
    const line = outcome.stdout;
    if (line.length === 0) return false;
    return line !== MAC_RESPONSE_CLOSED && line !== MAC_RESPONSE_TIMEOUT;
  }
  if (process.platform === 'win32') {
    // ntfytoast: 0 activated (the toast body), 4 a button. 2 dismissed,
    // 3 timed out, 1 suppressed by Focus Assist.
    return outcome.code === 0 || outcome.code === 4;
  }
  // notify-send reports nothing about clicks.
  return false;
}

/**
 * AppUserModelID handed to ntfytoast on Windows. ntfytoast creates the Start
 * Menu shortcut named after it, and Windows shows that name as the toast's
 * sender — so this string is user-visible branding, not an internal id.
 */
export const WINDOWS_APP_ID = 'Swttch';

/**
 * Bundle directory name of the macOS notifier, in ./vendor and in ~/Applications
 * alike.
 *
 * Our own bundle, not the stock terminal-notifier one, and that is what makes
 * the banner wear our icon: macOS takes a notification's icon from the bundle
 * that sent it and offers no way to override it per notification, so a custom
 * bundle is the documented way to have one (see vendor/README.md). It also
 * gives us our own row in System Settings > Notifications, named Swttch rather
 * than something the user has never heard of, and leaves a user's own copy of
 * terminal-notifier alone.
 */
const MAC_APP_BUNDLE = 'Swttch.app';

/**
 * Bundle identifier of that notifier, which is also the row the user sees in
 * System Settings > Notifications.
 *
 * Ours rather than upstream's, for two reasons. We build the executable from
 * source (to request badge permission, which upstream does not), so shipping it
 * under the upstream author's domain would misattribute it. And macOS keys
 * notification permission to this string: sharing upstream's would mean
 * inheriting — or fighting over — the grant belonging to a copy of
 * terminal-notifier the user installed themselves.
 *
 * Changing it is not free: macOS treats a new identifier as an app it has never
 * seen, so every user is asked for permission again and the alert style they
 * had chosen is forgotten.
 *
 * Read from the bundle we ship rather than written out here as well. Two copies
 * of the same string is two things to keep in step, and the cost of them
 * drifting is silent: we would ask macOS about one identifier while the banners
 * arrive under another, so the alert-style hint reads the wrong app forever.
 * It also lets the notification test harness rename the bundle — the only way
 * to get the permission prompt back, since macOS remembers a granted identifier
 * in a database no uninstall clears.
 */
export function macNotifierBundleId(): string {
  if (cachedBundleId !== undefined) return cachedBundleId;
  cachedBundleId = readBundleIdentifier(join(macNotifierVendorApp(), MAC_APP_PLIST_REL));
  return cachedBundleId;
}

/** Resolved once: the bundle it is read from cannot change while we run. */
let cachedBundleId: string | undefined;

/**
 * What we fall back to when the bundle cannot be read.
 *
 * Only reachable if the vendored bundle is missing or malformed, in which case
 * no notification can be raised anyway and this value is never used against a
 * real bundle. It exists so callers get a string rather than having to handle a
 * null they can do nothing about.
 */
const MAC_BUNDLE_ID_FALLBACK = 'com.github.yhk1038.claude-code-gui.notifier';

/**
 * Read `CFBundleIdentifier` out of an Info.plist file.
 *
 * Exported for tests. Same regex-not-parser reasoning as
 * {@link readBundleVersion}: one known key out of a fixed XML file we ship.
 */
export function readBundleIdentifier(plistPath: string): string {
  try {
    const xml = readFileSync(plistPath, 'utf-8');
    const match = /<key>CFBundleIdentifier<\/key>\s*<string>([^<]*)<\/string>/.exec(xml);
    if (match && match[1].length > 0) return match[1];
  } catch {
    // Fall through to the constant below.
  }
  console.error('[node-backend]', `could not read CFBundleIdentifier from ${plistPath}`);
  return MAC_BUNDLE_ID_FALLBACK;
}

/** Test seam: forget the resolved identifier. */
export function resetMacNotifierBundleIdCache(): void {
  cachedBundleId = undefined;
}

/** Executable inside that bundle, relative to the bundle directory. */
const MAC_APP_EXEC_REL = 'Contents/MacOS/terminal-notifier';

/** Bundle metadata file read to decide whether an installed copy is current. */
const MAC_APP_PLIST_REL = 'Contents/Info.plist';

/**
 * LaunchServices registration tool. A bundle freshly copied into ~/Applications
 * is not yet known to LaunchServices, and until it is, macOS reports
 * `alert style: none` and refuses to deliver. Running this on the copy flips it
 * to `banners` (measured on macOS 26.6.2).
 */
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

// ── Paths ───────────────────────────────────────────────────────────────────

/**
 * The shipped vendor directory, resolved next to the running module: the source
 * tree under tsx, `dist/vendor` in the esbuild bundle. Same mechanism as
 * core/win-job.ts uses for its PowerShell wrapper.
 */
export function vendorDir(): string {
  return fileURLToPath(new URL('./vendor/', import.meta.url));
}

/** The macOS notifier bundle as shipped, which is NOT the one that gets run. */
export function macNotifierVendorApp(): string {
  return join(vendorDir(), MAC_APP_BUNDLE);
}

/**
 * Where the macOS notifier bundle is run from. macOS only grants notification
 * permission to a bundle inside an Applications directory, so the shipped copy
 * is installed here first (vendor/README.md has the -diagnose measurements).
 */
export function macNotifierInstalledApp(): string {
  return join(homedir(), 'Applications', MAC_APP_BUNDLE);
}

/** The Windows notifier, run straight from the vendor directory. */
export function windowsNotifierExe(): string {
  return join(vendorDir(), 'ntfytoast.exe');
}

// ── Argument construction ───────────────────────────────────────────────────

export function buildMacNotifierArgs(options: OsNotificationOptions): string[] {
  // terminal-notifier rejects an empty -message, and a body is genuinely
  // optional for us, so an empty body becomes a space.
  const args = ['-title', options.title, '-message', options.body.length > 0 ? options.body : ' '];
  if (options.groupId) args.push('-group', options.groupId);
  // No -activate: see NOTIFIER_STAYS_FOR_CLICK. Adding one would silently stop
  // the click from ever being reported to us.
  if (options.clickActionTitle) {
    // A title containing a comma would be split into two buttons, so it is
    // rejected here rather than producing a stray second button.
    args.push('-action', options.clickActionTitle.replace(/,/g, ' '));
    if (options.clickTimeoutSeconds !== undefined) {
      args.push('-timeout', String(options.clickTimeoutSeconds));
    }
  }
  return args;
}

export function buildWindowsNotifierArgs(options: OsNotificationOptions): string[] {
  const args = ['-t', options.title, '-m', options.body.length > 0 ? options.body : ' '];
  // -appID is what registers the AppUserModelID; without it Windows may drop
  // the toast entirely. activateBundleId is a macOS concept and is ignored here.
  args.push('-appID', WINDOWS_APP_ID);
  if (options.groupId) args.push('-id', options.groupId);
  return args;
}

export function buildLinuxNotifierArgs(options: OsNotificationOptions): string[] {
  // notify-send takes title and body as separate args, so nothing needs escaping.
  // libnotify reports no click back to us, so the click options are dropped.
  return [options.title, options.body];
}

// ── macOS install ───────────────────────────────────────────────────────────

/**
 * Pull the two version keys out of an Info.plist. Deliberately a regex and not
 * a plist parser: the file is upstream's own fixed XML and the only thing we
 * need from it is "is the installed copy the same build as the shipped one".
 * Returns null when either key is missing, which callers read as "unknown, so
 * reinstall".
 */
export function readBundleVersion(plistXml: string): string | null {
  const short = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]*)<\/string>/.exec(plistXml);
  const build = /<key>CFBundleVersion<\/key>\s*<string>([^<]*)<\/string>/.exec(plistXml);
  if (!short || !build) return null;
  return `${short[1]}+${build[1]}`;
}

/**
 * Whether the installed bundle has to be replaced by the shipped one.
 *
 * Version equality — not content equality — is the test on purpose: a user may
 * already keep their own terminal-notifier in ~/Applications, and replacing a
 * copy that is the same release as ours would delete their file to gain
 * nothing. A version bump on our side is what makes us take it over.
 */
export function macNotifierNeedsInstall(
  vendorPlistXml: string,
  installedPlistXml: string | null,
): boolean {
  if (installedPlistXml === null) return true;
  const vendorVersion = readBundleVersion(vendorPlistXml);
  if (vendorVersion === null) return true;
  return readBundleVersion(installedPlistXml) !== vendorVersion;
}

/**
 * Put the shipped bundle in place and hand back the executable to run, or null
 * when the shipped bundle is missing (a distributable that lost it).
 *
 * The replacement is staged next to the destination and renamed over it, so a
 * backend reading the bundle at that moment sees either the old tree or the new
 * one, never a half-deleted one.
 */
export function installMacNotifier(vendorApp: string, installedApp: string): string | null {
  const vendorPlist = join(vendorApp, MAC_APP_PLIST_REL);
  if (!existsSync(vendorPlist)) return null;

  const installedPlist = join(installedApp, MAC_APP_PLIST_REL);
  const installedPlistXml = existsSync(installedPlist)
    ? readFileSync(installedPlist, 'utf-8')
    : null;

  const installedExec = join(installedApp, MAC_APP_EXEC_REL);
  if (!macNotifierNeedsInstall(readFileSync(vendorPlist, 'utf-8'), installedPlistXml)) {
    return existsSync(installedExec) ? installedExec : null;
  }

  mkdirSync(dirname(installedApp), { recursive: true });
  const staging = `${installedApp}.ccg-staging-${process.pid}`;
  rmSync(staging, { recursive: true, force: true });
  try {
    cpSync(vendorApp, staging, { recursive: true });
    // cpSync carries the mode over, but a distributable that lost the bit
    // (a zip round-trip, a Copy task) would leave an unrunnable bundle.
    chmodSync(join(staging, MAC_APP_EXEC_REL), 0o755);
    rmSync(installedApp, { recursive: true, force: true });
    renameSync(staging, installedApp);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }

  registerWithLaunchServices(installedApp);
  return existsSync(installedExec) ? installedExec : null;
}

/**
 * Announce a newly installed bundle to LaunchServices, and wait for it.
 *
 * Waiting matters. This runs on the way to raising the very first banner, and
 * macOS takes the banner's icon from what LaunchServices knows about the bundle.
 * Fired and forgotten, the banner goes out first and arrives wearing the blank
 * placeholder document icon instead of ours — which is exactly what happened
 * when the bundle identifier changed and the app became new to macOS again.
 *
 * `lsregister -f` returns in well under a second. The timeout is there so a
 * wedged LaunchServices costs one notification's delay rather than the banner.
 */
function registerWithLaunchServices(installedApp: string): void {
  if (!existsSync(LSREGISTER)) return;
  try {
    spawnSync(LSREGISTER, ['-f', installedApp], { stdio: 'ignore', timeout: 5000 });
  } catch {
    // Registration is an optimisation for the first run; a failure only means
    // the user may have to trigger one more notification.
  }
}

/**
 * Install once per backend process. The result is cached even when it is null,
 * because a missing bundle will still be missing on the next notification and
 * re-walking the filesystem for every banner buys nothing.
 */
let macNotifierExec: string | null | undefined;

function resolveMacNotifier(): string | null {
  // A path decided once, but only while it still leads somewhere. The user owns
  // ~/Applications and may well drag our notifier to the Trash; holding the
  // remembered path would then mean every later notification spawns a file that
  // is gone, silently, until the backend restarts. One existsSync per
  // notification buys back the ability to reinstall.
  if (macNotifierExec !== undefined) {
    if (macNotifierExec === null || existsSync(macNotifierExec)) return macNotifierExec;
    macNotifierExec = undefined;
  }
  try {
    macNotifierExec = installMacNotifier(macNotifierVendorApp(), macNotifierInstalledApp());
  } catch (err) {
    console.error(
      '[node-backend]',
      'macOS notifier install failed:',
      err instanceof Error ? err.message : String(err),
    );
    macNotifierExec = null;
  }
  return macNotifierExec;
}

/** Test seam: drop the once-per-process install decision. */
export function resetMacNotifierCache(): void {
  macNotifierExec = undefined;
}

// ── Launching ───────────────────────────────────────────────────────────────

/**
 * What the notifier reported once it finished.
 *
 * The two OS notifiers do NOT share an exit-code vocabulary — 3 means "timed
 * out" to ntfytoast and "not authorized" to terminal-notifier — so the code is
 * handed over raw and read by the per-OS interpreter below. Reading it with the
 * wrong dictionary is how a refused permission would look like a banner that
 * quietly expired.
 */
export interface NotifierOutcome {
  /** Process exit code, or null when it was killed by a signal. */
  code: number | null;
  /** Anything the notifier printed. macOS reports a click here. */
  stdout: string;
}

/**
 * Exit codes ntfytoast uses to report what the user did with the toast. Only a
 * value outside this set means the toaster actually failed.
 *
 * 0 activated · 1 hidden (e.g. Focus Assist) · 2 dismissed · 3 timed out ·
 * 4 button pressed · 5 text entered.
 *
 * Treating any non-zero code as an error would log a failure every single time
 * a banner quietly expires, which is the normal ending for almost every
 * notification we raise.
 */
const WINDOWS_USER_OUTCOME_CODES = new Set([0, 1, 2, 3, 4, 5]);

/**
 * Exit codes terminal-notifier uses (TNExit* in its AppDelegate.m).
 *
 * 0 success · 1 usage · 2 bad argument · 3 NOT AUTHORIZED · 4 timeout ·
 * 5 delivery failed · 6 no response.
 *
 * Only 0, 4 and 6 are ordinary endings: the banner was raised, or it was raised
 * with a button nobody pressed. Everything else is a real failure, and 3 is the
 * one that matters most — it is the user having refused notification permission.
 */
export const MAC_EXIT_NOT_AUTHORIZED = 3;
const MAC_USER_OUTCOME_CODES = new Set([0, 4, 6]);

/** Whether this exit code is an ordinary ending rather than a failure. */
function isExpectedExit(platform: NodeJS.Platform, code: number): boolean {
  if (platform === 'darwin') return MAC_USER_OUTCOME_CODES.has(code);
  if (platform === 'win32') return WINDOWS_USER_OUTCOME_CODES.has(code);
  // notify-send exits 0 on success and non-zero on a real failure.
  return code === 0;
}

/**
 * Start the notifier and resolve as soon as it is running — NOT when it exits.
 *
 * Waiting for exit would hang the caller: ntfytoast stays alive until the toast
 * is clicked or times out, and terminal-notifier blocks on the macOS permission
 * prompt the very first time an unapproved bundle fires.
 *
 * What the notifier eventually reports still matters — a click to return to, a
 * permission the user refused — so it arrives later through [onOutcome] instead
 * of through the returned promise. A caller that only wants the banner raised
 * can ignore it entirely.
 */
function launch(
  command: string,
  args: string[],
  onOutcome?: (outcome: NotifierOutcome) => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      // stdout is piped rather than ignored because macOS reports a click on it.
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      let stdout = '';
      // A notifier that never ran reports nothing, and an exit code produced by
      // the failure to launch is not the user having answered anything. Callers
      // record a permission decision from this outcome, so handing them one
      // here would write down an answer nobody gave.
      let neverRan = false;
      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.on('error', (err) => {
        neverRan = true;
        console.error('[node-backend]', 'showOsNotification failed:', err.message);
        resolve();
      });
      child.on('spawn', () => resolve());
      child.on('close', (code) => {
        if (neverRan) return;
        if (code !== null && !isExpectedExit(process.platform, code)) {
          console.error('[node-backend]', `notifier ${command} exited with ${code}`);
        }
        onOutcome?.({ code, stdout: stdout.trim() });
      });
    } catch (err) {
      console.error(
        '[node-backend]',
        'showOsNotification failed:',
        err instanceof Error ? err.message : String(err),
      );
      resolve();
    }
  });
}

/**
 * Raise a real OS desktop notification.
 *
 * Used when the IDE is in the background, where an in-IDE balloon would sit
 * behind other windows. Fire-and-forget: a failure is logged, never propagated.
 */
export function showOsNotification(
  options: OsNotificationOptions,
  onOutcome?: (outcome: NotifierOutcome) => void,
): Promise<void> {
  if (process.platform === 'darwin') {
    const exec = resolveMacNotifier();
    if (exec === null) {
      console.error('[node-backend]', 'showOsNotification skipped: macOS notifier unavailable');
      return Promise.resolve();
    }
    return launch(exec, buildMacNotifierArgs(options), onOutcome);
  }
  if (process.platform === 'win32') {
    const exe = windowsNotifierExe();
    if (!existsSync(exe)) {
      console.error('[node-backend]', `showOsNotification skipped: ${exe} is missing`);
      return Promise.resolve();
    }
    return launch(exe, buildWindowsNotifierArgs(options), onOutcome);
  }
  return launch('notify-send', buildLinuxNotifierArgs(options), onOutcome);
}
