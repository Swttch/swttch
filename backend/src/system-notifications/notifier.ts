import { spawn, spawnSync, type ChildProcess } from 'child_process';
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
   *
   * macOS only. ntfytoast takes no such value — see buildWindowsNotifierArgs.
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
 * AppUserModelID handed to ntfytoast on Windows, and the name of the Start Menu
 * shortcut that carries it (see installWindowsAppId). Windows shows that name as
 * the toast's sender, so this string is user-visible branding rather than an
 * internal id.
 *
 * "Swttch Notifier" rather than plain "Swttch": a desktop app is planned for the
 * future under the name Swttch itself, and this toast sender would then be
 * indistinguishable from that app in the user's eyes (and, on Windows, in the
 * Start Menu). A name reserved for notifications keeps the two apart before the
 * desktop app exists to collide with it. Matches the macOS bundle, whose
 * CFBundleName is already "Swttch Notifier" for the same reason.
 *
 * A space inside an AppUserModelID is not a Windows restriction: measured on
 * Windows 11 build 26200.9457, `ntfytoast -install "Swttch Notifier" <exe>
 * "Swttch Notifier"` installs cleanly (exit 0) and a toast fired with
 * `-appID "Swttch Notifier"` displays normally (exit 3, ordinary timeout).
 */
export const WINDOWS_APP_ID = 'Swttch Notifier';

/**
 * Icon drawn on the Windows toast, handed to ntfytoast with `-p`.
 *
 * Windows, unlike macOS, takes the picture from the notification itself instead
 * of from the sending application, so this is a plain file we ship rather than
 * something buried in a bundle. It is the same logo as the macOS bundle's
 * icon.icns, converted to the format the toast accepts: PNG, no larger than
 * 1024x1024 and under 200 kB (measured on Windows 11 26200.9457 — this file is
 * 256x256 and 25 kB). Both the toast's header and its body show it.
 */
const WINDOWS_ICON_FILE = 'windows-toast-icon.png';

/**
 * Bundle directory name of the macOS notifier, in ./vendor and in ~/Applications
 * alike.
 *
 * Our own bundle, not the stock terminal-notifier one, and that is what makes
 * the banner wear our icon: macOS takes a notification's icon from the bundle
 * that sent it and offers no way to override it per notification, so a custom
 * bundle is the documented way to have one (see vendor/README.md). It also
 * gives us our own row in System Settings > Notifications, named Swttch
 * Notifier rather than something the user has never heard of, and leaves a
 * user's own copy of terminal-notifier alone.
 */
const MAC_APP_BUNDLE = 'Swttch Notifier.app';

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

/** The picture the Windows toast wears, shipped beside the notifier. */
export function windowsNotifierIcon(): string {
  return join(vendorDir(), WINDOWS_ICON_FILE);
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

/**
 * Everything below is measured on Windows 11 build 26200.9457 against the
 * ntfytoast.exe vendored here (SHA-256 6cfcd1a6…c6c9f), not read off its
 * documentation.
 *
 * [iconPath] is a parameter rather than a constant so a test can hand over a
 * path that leads nowhere, the same way installMacNotifier takes its two
 * directories.
 */
export function buildWindowsNotifierArgs(
  options: OsNotificationOptions,
  iconPath: string = windowsNotifierIcon(),
): string[] {
  const args = ['-t', options.title, '-m', options.body.length > 0 ? options.body : ' '];
  // Which application Windows files the toast under. NOT what registers the
  // AppUserModelID — its own help says "Don't create a shortcut but use the
  // provided app id" — so the registration is done once, separately, by
  // installWindowsAppId. Without that registration the toast still appears, but
  // the -b button below is not drawn and no click is reported back.
  // activateBundleId is a macOS concept and is ignored here.
  args.push('-appID', WINDOWS_APP_ID);
  if (options.groupId) args.push('-id', options.groupId);
  if (options.clickActionTitle) {
    // The same button the macOS banner gets, from the same translated label.
    // Unlike macOS, it is not what keeps the process listening — ntfytoast waits
    // for the toast either way and answers with its exit code — but it is what
    // gives the user something to aim at, and pressing it exits 4 with the label
    // on stdout.
    args.push('-b', options.clickActionTitle);
  }
  if (existsSync(iconPath)) {
    // Only when the file is really there. What ntfytoast does with a picture
    // path that leads nowhere is not measured, and a toast wearing the default
    // Windows icon still calls the user back; a toast that failed to appear does
    // not.
    args.push('-p', iconPath);
  }
  // The sound is not ntfytoast's to play: the webview rings the one the user
  // chose, through the backend, on its own schedule and its own setting
  // (playNotificationSound). Leaving this off means the user hears two sounds,
  // one of them not the one they picked. The browser banner is silenced for
  // exactly the same reason.
  args.push('-silent');
  // 25.5 seconds on screen instead of the default 7. This banner exists to
  // reach someone who walked away from the machine, and 7 seconds does not.
  // NOT `-persistent`, which does keep the toast up until it is dismissed but
  // ends the process with exit code -1 (Failed) after 60 seconds — an ordinary
  // ending we would have to log as a failure or else stop noticing real ones.
  args.push('-d', 'long');
  // clickTimeoutSeconds is dropped here, and that is not an oversight: ntfytoast
  // takes no duration in seconds, only the two named lengths above. Written down
  // so the next reader does not go and measure it again.
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

  clearQuarantine(installedApp);
  registerWithLaunchServices(installedApp);
  return existsSync(installedExec) ? installedExec : null;
}

/**
 * Strip the quarantine flag macOS puts on anything that arrived from the
 * internet.
 *
 * Without this the notifier does not run at all for anyone who installed the
 * plugin the normal way. The flag travels from the downloaded marketplace zip
 * into the plugin jar and on into every file unpacked out of it, and Gatekeeper
 * answers a quarantined ad-hoc-signed binary by killing it and offering to move
 * it to the Bin — measured end to end, from a zip marked the way Safari marks a
 * download. Nothing is logged; the process is simply gone.
 *
 * This is our own file, taken out of a plugin the user chose to install, and
 * copied by that plugin into their Applications folder. Clearing the flag says
 * exactly that: it did not come from the internet independently of the thing
 * they already trusted.
 *
 * The real fix is a Developer ID signature and notarisation, which would make
 * the flag harmless instead of removed. Until the plugin has that, this is what
 * makes desktop notifications work outside a development checkout.
 */
function clearQuarantine(installedApp: string): void {
  try {
    spawnSync('xattr', ['-dr', 'com.apple.quarantine', installedApp], {
      stdio: 'ignore',
      timeout: 5000,
    });
  } catch {
    // A missing xattr binary is not worth failing over: on a machine where the
    // bundle was never quarantined (a checkout, a local build) there is nothing
    // to clear anyway.
  }
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

// ── Windows registration ────────────────────────────────────────────────────

/**
 * Teach Windows our AppUserModelID, by letting ntfytoast put a Start Menu
 * shortcut carrying it in place.
 *
 * This is the Windows counterpart of installMacNotifier plus
 * registerWithLaunchServices: the OS will not treat a toast as fully ours until
 * it knows who "ours" is, and until then it silently drops the interactive half
 * of the notification.
 *
 * Measured on Windows 11 26200.9457. Firing a toast with `-appID "Swttch
 * Notifier"` alone, on a machine where nothing had registered that id, produces
 * a banner with NO
 * button on it even though `-b "Open session"` was passed, and clicking the
 * banner body ends the process with code 3 (TimedOut) rather than 4
 * (ButtonPressed) — so the click never comes back to us and the user never
 * returns to their session. After this shortcut exists, the same command draws
 * the button and a press exits 4 with the label on stdout.
 *
 * Waited on with spawnSync, for the reason registerWithLaunchServices is:
 * whatever races the first banner loses, and the first banner is the one the
 * user looks hardest at. Waiting is still not quite enough — the round of
 * notifications fired immediately after the shortcut appeared came out without
 * the button, and only the next round had it. Windows evidently takes a moment
 * longer to pick the shortcut up than the process takes to exit, and there is no
 * measured signal to wait on for that, so this is written down rather than
 * papered over with a sleep of a length nobody has justified.
 *
 * Failure is not fatal: without the registration the banner itself still
 * appears, which is most of what the user came for.
 */
export function installWindowsAppId(exe: string): void {
  // `-install <shortcut name> <application> <appID>`. The shortcut is named
  // after the app id on purpose: the name is what the user sees in their Start
  // Menu and as the toast's sender, and one string for both is one thing to
  // keep true.
  spawnSync(exe, ['-install', WINDOWS_APP_ID, exe, WINDOWS_APP_ID], {
    stdio: 'ignore',
    timeout: 5000,
  });
}

/**
 * Registered once per backend process, like the macOS install. Retrying it for
 * every banner would cost a process launch to rewrite a shortcut that is already
 * there.
 */
let windowsAppIdRegistered = false;

function ensureWindowsAppId(exe: string): void {
  if (windowsAppIdRegistered) return;
  // Marked done before the attempt, not after: a registration that throws will
  // throw again on the next banner, and a notification is not the place to keep
  // paying for it.
  windowsAppIdRegistered = true;
  try {
    installWindowsAppId(exe);
  } catch (err) {
    console.error(
      '[node-backend]',
      'Windows AppUserModelID registration failed:',
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Test seam: drop the once-per-process registration decision. */
export function resetWindowsAppIdCache(): void {
  windowsAppIdRegistered = false;
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
 *
 * 4294967295 (0xFFFFFFFF) belongs in this set too, even though ntfytoast's own
 * `-h` output calls it `Failed : -1`. Node reports a Windows process exit code
 * as an unsigned 32-bit number, so the process's actual exit code of -1 arrives
 * here as 4294967295 rather than -1. And this one is not the failure its name
 * suggests: it has been measured twice coming out of an entirely ordinary
 * notification, both times about 60 seconds after the banner appeared — once
 * while probing `-persistent` (never shipped, see buildWindowsNotifierArgs),
 * and once from the plain `-d long` toast this backend actually sends. Why 60
 * seconds is not known; only the two measurements are. Logging it as a failure
 * would bury real ones under a line that appears at the end of ordinary use.
 */
const WINDOWS_USER_OUTCOME_CODES = new Set([0, 1, 2, 3, 4, 5, 4294967295]);

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
/**
 * The notifier still listening for a click, per group.
 *
 * A notifier given a click button stays alive for the whole click window, so a
 * session that finishes ten turns while its user is away would leave ten
 * processes behind — nine of them waiting on banners macOS has already replaced,
 * since a new banner in the same group supersedes the previous one. Only the
 * newest can still be clicked, so only the newest is worth keeping.
 *
 * Keyed by group (the panel id). Notifications without one are not tracked:
 * nothing supersedes them, so there is nothing to retire.
 */
const liveNotifiers = new Map<string, ChildProcess>();

/** Test seam: forget the tracked processes without killing anything. */
export function resetLiveNotifiers(): void {
  liveNotifiers.clear();
}

function launch(
  command: string,
  args: string[],
  onOutcome?: (outcome: NotifierOutcome) => void,
  groupId?: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      // stdout is piped rather than ignored because macOS reports a click on it.
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
      if (groupId !== undefined) {
        // Retire the previous one for this group: its banner has just been
        // replaced, so it is waiting for a click that can no longer happen.
        liveNotifiers.get(groupId)?.kill();
        liveNotifiers.set(groupId, child);
      }
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
        // Only drop the entry if it is still ours; a newer notifier for this
        // group may have replaced it already.
        if (groupId !== undefined && liveNotifiers.get(groupId) === child) {
          liveNotifiers.delete(groupId);
        }
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
    return launch(exec, buildMacNotifierArgs(options), onOutcome, options.groupId);
  }
  if (process.platform === 'win32') {
    const exe = windowsNotifierExe();
    if (!existsSync(exe)) {
      console.error('[node-backend]', `showOsNotification skipped: ${exe} is missing`);
      return Promise.resolve();
    }
    // Before the first toast, never after: an unregistered AppUserModelID costs
    // the button and the click report, which is half of what this feature is.
    ensureWindowsAppId(exe);
    return launch(exe, buildWindowsNotifierArgs(options), onOutcome, options.groupId);
  }
  return launch('notify-send', buildLinuxNotifierArgs(options), onOutcome, options.groupId);
}
