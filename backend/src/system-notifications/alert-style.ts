import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { macNotifierBundleId, macNotifierInstalledApp } from './notifier';

/**
 * Whether macOS keeps our banners on screen until dismissed, or lets them fade.
 *
 * macOS calls these Alerts and Banners in System Settings, and the choice
 * belongs to the user: there is no API for an app to set it, and the
 * `NSUserNotificationAlertStyle` key that used to suggest one is ignored for a
 * bundle like ours (measured against Slack, Discord and WebStorm, all of which
 * stay on screen WITHOUT that key). A notification that fades after a few
 * seconds is the wrong thing for "your session finished while you were away",
 * so the settings screen offers to walk the user to that switch.
 *
 * Offering it unconditionally would nag the people who already fixed it, hence
 * this read.
 *
 * The answer comes from asking our own notifier, which reports what
 * `UNUserNotificationCenter` tells it. Reading macOS's preference file directly
 * was tried first and does not work: the row exists in System Settings while
 * `com.apple.ncprefs.plist` still has no entry for the bundle at all, so every
 * read came back "unknown" and the hint never appeared. The plist is a cache
 * macOS writes on its own schedule; the notification centre is the source.
 */

const execFileAsync = promisify(execFile);

/** Executable inside the installed bundle, relative to the bundle directory. */
const MAC_APP_EXEC_REL = 'Contents/MacOS/terminal-notifier';

export type BannerPersistence = 'persistent' | 'transient' | 'unknown';

/** What the user has answered, as macOS currently has it recorded. */
export type NotifierAuthorization = 'authorized' | 'denied' | 'notRequested' | 'unknown';

/**
 * Read the authorization line out of `terminal-notifier -diagnose` output.
 *
 * Exported for tests. The three values it prints come from
 * `UNAuthorizationStatus`: "authorized", "denied", "not requested yet".
 */
export function parseAuthorization(diagnoseOutput: string): NotifierAuthorization {
  const match = /^\s*authorization\s+(.+?)\s*$/m.exec(diagnoseOutput);
  if (!match) return 'unknown';
  const value = match[1];
  if (value.startsWith('authorized')) return 'authorized';
  if (value.startsWith('denied')) return 'denied';
  if (value.startsWith('not requested')) return 'notRequested';
  return 'unknown';
}

/**
 * Read the alert style out of `terminal-notifier -diagnose` output.
 *
 * Exported for tests. The line is `  alert style         banners`, and the
 * three values that matter are `banners` (fades), `alerts` (stays up) and
 * `none` (the user switched notifications off entirely, or permission has never
 * been requested — either way there is no fading banner to complain about).
 */
export function parseAlertStyle(diagnoseOutput: string): BannerPersistence {
  const match = /^\s*alert style\s+(\S+)/m.exec(diagnoseOutput);
  if (!match) return 'unknown';
  if (match[1] === 'banners') return 'transient';
  if (match[1] === 'alerts') return 'persistent';
  return 'unknown';
}

/**
 * How long our banners stay on screen, as the user currently has it set.
 *
 * `unknown` on every non-macOS host, and on a macOS host where the notifier is
 * not installed yet or cannot answer. Callers treat unknown as "do not claim
 * anything" rather than as either answer — a hint that appears wrongly is worse
 * than one that does not appear.
 *
 * Deliberately does NOT install the notifier: this runs when the settings
 * screen opens, and installing a bundle into ~/Applications because someone
 * looked at a settings page would be a surprising thing to do. Before the first
 * notification there is nothing to report anyway.
 */
export async function readBannerPersistence(): Promise<BannerPersistence> {
  return (await readNotifierStatus()).persistence;
}

/** Everything one `-diagnose` run can tell us about our own notifier. */
export interface NotifierStatus {
  authorization: NotifierAuthorization;
  persistence: BannerPersistence;
}

/**
 * Ask the installed notifier what macOS currently thinks of it.
 *
 * One process for both answers: they come from the same `getNotificationSettings`
 * call inside the notifier, and the two callers that need them — the settings
 * hint and the first-permission walk-through — would otherwise spawn twice.
 *
 * Everything is `unknown` when the notifier is not installed yet. This runs
 * while a settings screen is open, and installing a bundle into ~/Applications
 * because someone looked at a page would be a surprising thing to do.
 */
export async function readNotifierStatus(): Promise<NotifierStatus> {
  if (process.platform !== 'darwin') return { authorization: 'unknown', persistence: 'unknown' };
  const exec = join(macNotifierInstalledApp(), MAC_APP_EXEC_REL);
  if (!existsSync(exec)) return { authorization: 'unknown', persistence: 'unknown' };
  try {
    const { stdout } = await execFileAsync(exec, ['-diagnose'], { timeout: 5000 });
    return { authorization: parseAuthorization(stdout), persistence: parseAlertStyle(stdout) };
  } catch {
    // A notifier that cannot answer costs the hint and nothing else.
    return { authorization: 'unknown', persistence: 'unknown' };
  }
}

/**
 * Put the user in front of the macOS switch that decides how long our banners
 * stay on screen.
 *
 * Deep-links straight to our own row in System Settings > Notifications rather
 * than to the list: the list holds a hundred apps and the row is named after a
 * notifier the user has never heard of.
 *
 * Shared by the settings screen's hint and by the walk-through that runs right
 * after permission is granted, because both mean "take me to that switch".
 */
export async function openNotificationSettings(): Promise<void> {
  const url =
    'x-apple.systempreferences:com.apple.Notifications-Settings.extension'
    + `?id=${macNotifierBundleId()}`;
  await execFileAsync('open', [url]);
}

/**
 * Wait for macOS to finish registering our notifier, then offer the user the
 * switch that keeps banners on screen.
 *
 * Runs once, right after the user grants permission for the first time. That is
 * the one moment the choice is in front of them: they have just decided they
 * want these notifications, and macOS has just defaulted them to the style that
 * makes one vanish after a few seconds — the wrong style for "your session
 * finished while you were away".
 *
 * The wait is not optional. Granting permission does not register the bundle
 * instantly, and opening the settings deep-link too early lands on a page for an
 * app macOS does not list yet.
 *
 * Gives up silently on every path that is not "registered, and set to fade":
 * already persistent means the user has nothing to fix, and never registering
 * means there is no page to open. An unasked-for System Settings window is worse
 * than a missing one.
 */
export async function offerPersistentBannersAfterGrant(): Promise<void> {
  if (process.platform !== 'darwin') return;
  const { persistence } = await readNotifierStatus();
  if (persistence !== 'transient') return; // nothing to fix, or nothing to open
  try {
    await openNotificationSettings();
  } catch (err) {
    console.error('[node-backend]', 'could not open notification settings:', err);
  }
}

/**
 * Wait for the user to answer the macOS permission prompt, and report what they
 * said.
 *
 * Polled rather than read off the notifier's exit code, even though the exit
 * code does carry a refusal. The notifier now stays alive for ten minutes
 * waiting for a click, so its exit code arrives ten minutes late — which would
 * put the answer into the settings file, and the follow-up offer on screen, long
 * after the moment they belong to. That was measured: permission was granted and
 * the switch stayed `null`.
 *
 * Resolves null when the user has not answered within the window. The prompt
 * stays on screen until they do, so silence means they walked away; the next
 * notification asks again, which is the right outcome.
 */
export async function awaitFirstPermissionAnswer(): Promise<boolean | null> {
  if (process.platform !== 'darwin') return null;
  // ~60s. The prompt waits for a person, and a person may be reading it, or
  // finishing a sentence first. Bounded so a prompt left overnight does not
  // leave this polling until the IDE closes.
  const ATTEMPTS = 120;
  const GAP_MS = 500;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const { authorization } = await readNotifierStatus();
    if (authorization === 'authorized') return true;
    if (authorization === 'denied') return false;
    await new Promise((resolve) => setTimeout(resolve, GAP_MS));
  }
  return null;
}
