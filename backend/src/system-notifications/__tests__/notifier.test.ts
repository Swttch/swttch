import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const spawnMock = vi.fn();
const spawnSyncMock = vi.fn((_cmd: string, _args?: readonly string[]) => ({ status: 0 }));
let homeOverride: string | null = null;

// Partial mocks: both modules carry a lot more than the one export replaced
// here, and a bare factory would erase the rest for every module this test
// pulls in.
vi.mock('child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('child_process')>()),
  spawn: spawnMock,
  spawnSync: spawnSyncMock,
}));

vi.mock('os', async (importOriginal) => {
  const real = await importOriginal<typeof import('os')>();
  return { ...real, homedir: () => homeOverride ?? real.homedir() };
});

const {
  resetLiveNotifiers,
  readBundleIdentifier,
  macNotifierBundleId,
  isClickToFocus,
  buildLinuxNotifierArgs,
  linuxReplacesId,
  buildMacNotifierArgs,
  buildWindowsNotifierArgs,
  installMacNotifier,
  macNotifierNeedsInstall,
  readBundleVersion,
  resetMacNotifierCache,
  resetWindowsAppIdCache,
  showOsNotification,
  vendorDir,
  windowsNotifierExe,
  windowsNotifierIcon,
  WINDOWS_APP_ID,
} = await import('../notifier');

/** A ChildProcess stand-in that reports a successful start on the next tick. */
function spawnsFine() {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit('spawn'));
  return child;
}

function plist(shortVersion: string, buildVersion: string): string {
  return [
    '<plist version="1.0">',
    '<dict>',
    '\t<key>CFBundleShortVersionString</key>',
    `\t<string>${shortVersion}</string>`,
    '\t<key>CFBundleVersion</key>',
    `\t<string>${buildVersion}</string>`,
    '</dict>',
    '</plist>',
  ].join('\n');
}

/** Build a bundle tree that looks enough like our notifier bundle to install. */
function makeBundle(root: string, shortVersion: string, buildVersion: string): string {
  mkdirSync(join(root, 'Contents', 'MacOS'), { recursive: true });
  writeFileSync(join(root, 'Contents', 'Info.plist'), plist(shortVersion, buildVersion));
  writeFileSync(join(root, 'Contents', 'MacOS', 'terminal-notifier'), '#!/bin/sh\nexit 0\n');
  return root;
}

const realPlatform = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(() => {
  spawnMock.mockReset();
  spawnSyncMock.mockClear();
  spawnMock.mockImplementation(() => spawnsFine());
  resetMacNotifierCache();
  resetWindowsAppIdCache();
});

/** The one spawnSync call that registers our AppUserModelID with Windows. */
function isAppIdInstall(call: unknown[]): boolean {
  const args = call[1] as readonly string[] | undefined;
  return args?.[0] === '-install';
}

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
  homeOverride = null;
  vi.restoreAllMocks();
});

describe('buildMacNotifierArgs', () => {
  it('passes title and body through as separate argv entries', () => {
    expect(buildMacNotifierArgs({ title: 'say "hi"', body: 'a\\b' })).toEqual([
      '-title',
      'say "hi"',
      '-message',
      'a\\b',
    ]);
  });

  it('substitutes a space for an empty body, which terminal-notifier rejects', () => {
    expect(buildMacNotifierArgs({ title: 't', body: '' })).toEqual(['-title', 't', '-message', ' ']);
  });

  it('carries groupId and the click button when given', () => {
    expect(
      buildMacNotifierArgs({
        title: 't',
        body: 'b',
        groupId: 'panel-7',
        clickActionTitle: 'Open',
        clickTimeoutSeconds: 600,
      }),
    ).toEqual([
      '-title',
      't',
      '-message',
      'b',
      '-group',
      'panel-7',
      '-action',
      'Open',
      '-timeout',
      '600',
    ]);
  });

  /**
   * The regression this guards is invisible at a glance: adding `-activate`
   * back would look like an improvement (macOS raises the app for us!) and
   * would silently stop every click from being reported, because the notifier
   * only reports a click on a notification that carries no click action of its
   * own. The IDE would then never be told to come forward.
   */
  it('never passes -activate, which would suppress the click report', () => {
    const args = buildMacNotifierArgs({
      title: 't',
      body: 'b',
      groupId: 'panel-7',
      clickActionTitle: 'Open',
    });
    expect(args).not.toContain('-activate');
  });

  // A comma is the separator between button titles, so a translated label
  // containing one would quietly produce a second, meaningless button.
  it('keeps a comma in the button label from splitting it into two buttons', () => {
    const args = buildMacNotifierArgs({ title: 't', body: 'b', clickActionTitle: 'Open, now' });
    expect(args[args.indexOf('-action') + 1]).toBe('Open  now');
  });

  it('omits the click options when the caller has nothing to raise', () => {
    const args = buildMacNotifierArgs({ title: 't', body: 'b' });
    expect(args).not.toContain('-group');
    expect(args).not.toContain('-action');
    expect(args).not.toContain('-activate');
  });
});

/**
 * Every expectation here is pinned to a measurement taken on Windows 11 build
 * 26200.9457 against the vendored ntfytoast.exe, not to its help text.
 */
describe('buildWindowsNotifierArgs', () => {
  it('always names the sending application', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b' });
    expect(args.slice(args.indexOf('-appID'), args.indexOf('-appID') + 2)).toEqual([
      '-appID',
      WINDOWS_APP_ID,
    ]);
  });

  /**
   * WINDOWS_APP_ID contains a space ("Swttch Notifier"). Node's spawn does not
   * go through a shell, so argv entries are passed to ntfytoast verbatim and a
   * space inside one does not split it into two — but that has to hold for
   * WHATEVER the branded name happens to be, not just be true by accident of
   * this particular string, so it is asserted directly rather than folded into
   * the array-equality check above.
   */
  it('keeps the app id as one argv entry even though it contains a space', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b' });
    expect(WINDOWS_APP_ID).toContain(' ');
    expect(args[args.indexOf('-appID') + 1]).toBe(WINDOWS_APP_ID);
  });

  it('maps title, body, group and button onto ntfytoast flags', () => {
    expect(
      buildWindowsNotifierArgs({
        title: "It's done",
        body: 'all good',
        groupId: 'panel-7',
        clickActionTitle: 'Open session',
      }),
    ).toEqual([
      '-t',
      "It's done",
      '-m',
      'all good',
      '-appID',
      WINDOWS_APP_ID,
      '-id',
      'panel-7',
      '-b',
      'Open session',
      '-p',
      windowsNotifierIcon(),
      '-silent',
      '-d',
      'long',
    ]);
  });

  /**
   * The button is not decoration. A toast whose only target is its body reports
   * a body click as code 3 — indistinguishable from nobody having touched it —
   * whereas the button press arrives as code 4 with the label on stdout, which
   * is what isClickToFocus reads to take the user back to their session.
   */
  it('carries the translated click button the caller supplies', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b', clickActionTitle: 'Open session' });
    expect(args[args.indexOf('-b') + 1]).toBe('Open session');
  });

  it('omits the button when the caller has nothing to raise', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b' });
    expect(args).not.toContain('-b');
    expect(args).not.toContain('-id');
  });

  /**
   * Windows takes the toast's picture from the notification rather than from
   * the sending application, so an unpassed icon means the generic Windows one
   * and nothing about the banner says it came from us.
   */
  it('dresses the toast in the icon shipped beside the notifier', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b' });
    expect(args[args.indexOf('-p') + 1]).toBe(windowsNotifierIcon());
    expect(existsSync(windowsNotifierIcon())).toBe(true);
  });

  // What ntfytoast does with a picture path that leads nowhere is not measured,
  // and a toast wearing the default icon still calls the user back — a toast
  // that failed to appear does not.
  it('omits the picture when the file is not there', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b' }, '/nowhere/absent.png');
    expect(args).not.toContain('-p');
    expect(args).not.toContain('/nowhere/absent.png');
  });

  /**
   * The sound belongs to the webview, which rings the one the user chose
   * through the backend. Without -silent, Windows adds its own on top and the
   * user hears two, one of them not theirs. The browser banner is silenced for
   * exactly the same reason.
   */
  it('silences ntfytoast, since the sound is played separately', () => {
    expect(buildWindowsNotifierArgs({ title: 't', body: 'b' })).toContain('-silent');
  });

  /**
   * 25.5 seconds instead of the default 7. This banner exists to reach someone
   * who walked away from the machine.
   */
  it('keeps the toast up for the long duration rather than the default', () => {
    const args = buildWindowsNotifierArgs({ title: 't', body: 'b' });
    expect(args.slice(args.indexOf('-d'), args.indexOf('-d') + 2)).toEqual(['-d', 'long']);
  });

  /**
   * -persistent does hold the toast until it is dismissed, and then ends the
   * process with code -1 (Failed) after 60 seconds. That is an ordinary ending
   * we would have to log as a failure, which is how a real failure stops being
   * noticed.
   */
  it('never asks for a persistent toast, which ends in a failure code', () => {
    expect(buildWindowsNotifierArgs({ title: 't', body: 'b' })).not.toContain('-persistent');
  });

  // ntfytoast takes the two named durations and no count of seconds, so the
  // macOS click window has nowhere to go here.
  it('drops the click timeout, which ntfytoast takes in no form', () => {
    const args = buildWindowsNotifierArgs({
      title: 't',
      body: 'b',
      clickActionTitle: 'Open session',
      clickTimeoutSeconds: 600,
    });
    expect(args).not.toContain('-timeout');
    expect(args).not.toContain('600');
  });
});

/**
 * Everything asserted here was measured on Debian 12 aarch64 against libnotify
 * 0.8.1 and dunst 1.9.0, in the standing bench at ignore/linux-desktop.
 */
describe('buildLinuxNotifierArgs', () => {
  const noIcon = '/definitely/not/here.png';

  it('names the sender, so the banner says who is calling', () => {
    const args = buildLinuxNotifierArgs({ title: 't', body: 'b' }, noIcon);
    expect(args.slice(0, 2)).toEqual(['--app-name', 'Swttch Notifier']);
  });

  /**
   * The Linux counterpart of the Windows `-silent` flag.
   *
   * Measured on the GNOME bench (GNOME Shell 43.9): two notifications produced
   * two chimes of its own, peak 0.298, on top of the one the webview plays —
   * and the same two went silent once this hint was attached. dunst 1.9.0 never
   * chimes either way and accepts the hint with exit 0.
   *
   * Unconditional on purpose. The daemon is not knowable from here, GNOME is
   * what most users run, and the spec requires a daemon that does not
   * implement the hint to ignore it.
   */
  it('asks the daemon to stay silent, or GNOME chimes on top of our own sound', () => {
    const withAction = buildLinuxNotifierArgs(
      { title: 't', body: 'b', clickActionTitle: 'Open session' },
      noIcon,
    );
    const withoutAction = buildLinuxNotifierArgs({ title: 't', body: 'b' }, noIcon);

    for (const args of [withAction, withoutAction]) {
      expect(args).toContain('--hint=boolean:suppress-sound:true');
    }
  });

  it('asks for the action, which is the only reason a click is ever reported', () => {
    const args = buildLinuxNotifierArgs(
      { title: 't', body: 'b', clickActionTitle: 'Open session' },
      noIcon,
    );
    // The KEY must stay "default" even though the label is translated: click
    // detection reads the key back, and a key that moved with the locale would
    // break the return path in every language at once.
    expect(args).toContain('--action');
    expect(args[args.indexOf('--action') + 1]).toBe('default=Open session');
  });

  it('bounds the wait, so an ignored banner does not leave a process forever', () => {
    const args = buildLinuxNotifierArgs(
      { title: 't', body: 'b', clickActionTitle: 'Open', clickTimeoutSeconds: 600 },
      noIcon,
    );
    // --expire-time is milliseconds.
    expect(args[args.indexOf('--expire-time') + 1]).toBe('600000');
  });

  it('never expires when nobody is waiting for a click', () => {
    const args = buildLinuxNotifierArgs({ title: 't', body: 'b' }, noIcon);
    expect(args[args.indexOf('--expire-time') + 1]).toBe('0');
    expect(args).not.toContain('--action');
  });

  it('turns the group id into the integer --replace-id demands', () => {
    const args = buildLinuxNotifierArgs({ title: 't', body: 'b', groupId: 'panel-7' }, noIcon);
    const value = args[args.indexOf('--replace-id') + 1];
    // Passing the string through unchanged makes notify-send exit 1 and draw
    // NOTHING ("Cannot parse integer value"), so the banner would be lost.
    expect(value).toBe(String(linuxReplacesId('panel-7')));
    expect(Number.isInteger(Number(value))).toBe(true);
  });

  it('omits --replace-id when there is no group to replace', () => {
    expect(buildLinuxNotifierArgs({ title: 't', body: 'b' }, noIcon)).not.toContain('--replace-id');
  });

  it('attaches the icon only when the file is really there', () => {
    expect(buildLinuxNotifierArgs({ title: 't', body: 'b' }, noIcon)).not.toContain('--icon');
    const real = buildLinuxNotifierArgs({ title: 't', body: 'b' }, __filename);
    expect(real[real.indexOf('--icon') + 1]).toBe(__filename);
  });

  it('puts -- before the text, or a body starting with a dash loses the banner', () => {
    const args = buildLinuxNotifierArgs({ title: '-t 5', body: '-u critical' }, noIcon);
    expect(args.slice(-3)).toEqual(['--', '-t 5', '-u critical']);
  });
});

describe('linuxReplacesId', () => {
  it('is stable, so the same panel keeps replacing its own banner', () => {
    expect(linuxReplacesId('panel-7')).toBe(linuxReplacesId('panel-7'));
  });

  it('separates panels, so one session never overwrites another', () => {
    expect(linuxReplacesId('panel-7')).not.toBe(linuxReplacesId('panel-8'));
  });

  it.each(['', 'panel-7', 'panel-8', 'a'.repeat(200), '한글-패널', '💥'])(
    'stays inside the signed range libnotify accepts for %p',
    (groupId) => {
      const id = linuxReplacesId(groupId);
      // Measured: 2147483647 is accepted, 2147483648 is refused as "out of
      // range". 0 is not a replacement request at all.
      expect(id).toBeGreaterThan(0);
      expect(id).toBeLessThanOrEqual(2147483647);
      expect(Number.isInteger(id)).toBe(true);
      // Above the small sequential ids the daemon hands the rest of the bus,
      // so our banner cannot replace another application's.
      expect(id).toBeGreaterThanOrEqual(0x40000000);
    },
  );
});

describe('readBundleVersion', () => {
  it('reads both version keys', () => {
    expect(readBundleVersion(plist('3.1.0', '17'))).toBe('3.1.0+17');
  });

  it('returns null when a key is missing', () => {
    expect(readBundleVersion('<plist><dict></dict></plist>')).toBeNull();
  });
});

describe('macNotifierNeedsInstall', () => {
  it('installs when nothing is there', () => {
    expect(macNotifierNeedsInstall(plist('3.1.0', '17'), null)).toBe(true);
  });

  it('leaves an installed copy of the same release alone', () => {
    expect(macNotifierNeedsInstall(plist('3.1.0', '17'), plist('3.1.0', '17'))).toBe(false);
  });

  it('replaces an installed copy of a different release', () => {
    expect(macNotifierNeedsInstall(plist('3.1.0', '17'), plist('3.0.0', '16'))).toBe(true);
  });

  it('replaces an installed copy whose version cannot be read', () => {
    expect(macNotifierNeedsInstall(plist('3.1.0', '17'), '<plist/>')).toBe(true);
  });
});

describe('installMacNotifier', () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'ccg-notifier-'));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it('copies the bundle and returns an executable path', () => {
    const vendor = makeBundle(join(work, 'vendor', 'Swttch Notifier.app'), '3.1.0', '17');
    const installed = join(work, 'Applications', 'Swttch Notifier.app');

    const exec = installMacNotifier(vendor, installed);

    expect(exec).toBe(join(installed, 'Contents', 'MacOS', 'terminal-notifier'));
    expect(readFileSync(exec as string, 'utf-8')).toContain('exit 0');
    expect(statSync(exec as string).mode & 0o111).toBe(0o111);
  });

  it('leaves an installed copy of the same release untouched', () => {
    const vendor = makeBundle(join(work, 'vendor', 'Swttch Notifier.app'), '3.1.0', '17');
    const installed = makeBundle(join(work, 'Applications', 'Swttch Notifier.app'), '3.1.0', '17');
    const sentinel = join(installed, 'Contents', 'sentinel.txt');
    writeFileSync(sentinel, 'user file');

    installMacNotifier(vendor, installed);

    expect(existsSync(sentinel)).toBe(true);
  });

  it('replaces an installed copy of an older release', () => {
    const vendor = makeBundle(join(work, 'vendor', 'Swttch Notifier.app'), '3.1.0', '17');
    const installed = makeBundle(join(work, 'Applications', 'Swttch Notifier.app'), '3.0.0', '16');
    const stale = join(installed, 'Contents', 'stale.txt');
    writeFileSync(stale, 'from the old release');

    installMacNotifier(vendor, installed);

    expect(existsSync(stale)).toBe(false);
    expect(readBundleVersion(readFileSync(join(installed, 'Contents', 'Info.plist'), 'utf-8'))).toBe(
      '3.1.0+17',
    );
  });

  it('leaves no staging directory behind', () => {
    const vendor = makeBundle(join(work, 'vendor', 'Swttch Notifier.app'), '3.1.0', '17');
    const installed = join(work, 'Applications', 'Swttch Notifier.app');

    installMacNotifier(vendor, installed);

    const staging = `${installed}.ccg-staging-${process.pid}`;
    expect(existsSync(staging)).toBe(false);
  });

  it('returns null when the shipped bundle is missing', () => {
    expect(
      installMacNotifier(join(work, 'nowhere.app'), join(work, 'Applications', 'x.app')),
    ).toBeNull();
  });
});

describe('showOsNotification', () => {
  it('runs notify-send on linux', async () => {
    setPlatform('linux');

    await showOsNotification({ title: 't', body: 'b' });

    const [command, args] = spawnMock.mock.calls[0];
    expect(command).toBe('notify-send');
    expect(args.slice(-3)).toEqual(['--', 't', 'b']);
  });

  it('never raises an osascript or powershell script any more', async () => {
    setPlatform('linux');

    await showOsNotification({ title: 't', body: 'b' });

    const commands = spawnMock.mock.calls.map((call) => call[0]);
    expect(commands).not.toContain('osascript');
    expect(commands).not.toContain('powershell');
  });

  it('resolves instead of rejecting when the notifier cannot start', async () => {
    setPlatform('linux');
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('ENOENT')));
      return child;
    });

    await expect(showOsNotification({ title: 't', body: 'b' })).resolves.toBeUndefined();
  });

  it('resolves instead of rejecting when spawn itself throws', async () => {
    setPlatform('linux');
    spawnMock.mockImplementation(() => {
      throw new Error('EACCES');
    });

    await expect(showOsNotification({ title: 't', body: 'b' })).resolves.toBeUndefined();
  });

  it('runs the vendored exe on win32, and skips silently when it is missing', async () => {
    setPlatform('win32');

    await showOsNotification({ title: 't', body: 'b' });

    // The vendored .exe is present in the source tree, so this must reach spawn.
    expect(existsSync(windowsNotifierExe())).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith(
      windowsNotifierExe(),
      buildWindowsNotifierArgs({ title: 't', body: 'b' }),
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
  });

  it('installs the shipped bundle into ~/Applications and runs the installed copy', async () => {
    setPlatform('darwin');
    const home = mkdtempSync(join(tmpdir(), 'ccg-home-'));
    homeOverride = home;
    try {
      await showOsNotification({ title: 't', body: 'b', groupId: 'panel-7' });

      const installedExec = join(
        home,
        'Applications',
        'Swttch Notifier.app',
        'Contents',
        'MacOS',
        'terminal-notifier',
      );
      expect(existsSync(installedExec)).toBe(true);
      expect(spawnMock).toHaveBeenLastCalledWith(
        installedExec,
        buildMacNotifierArgs({ title: 't', body: 'b', groupId: 'panel-7' }),
        { stdio: ['ignore', 'pipe', 'ignore'] },
      );
      // The copy comes from the shipped bundle, never from the plugin resource
      // dir being run in place.
      expect(existsSync(join(vendorDir(), 'Swttch Notifier.app'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('skips silently when the shipped macOS bundle is gone', async () => {
    setPlatform('darwin');
    const home = mkdtempSync(join(tmpdir(), 'ccg-home-'));
    homeOverride = home;
    try {
      expect(
        installMacNotifier(join(vendorDir(), 'not-a-bundle.app'), join(home, 'Applications', 'x.app')),
      ).toBeNull();
      expect(existsSync(join(home, 'Applications'))).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('notifier exit codes', () => {
  /**
   * The two notifiers do not share an exit-code vocabulary, and reading one
   * with the other's dictionary is how a refused permission would be mistaken
   * for a banner that quietly expired. Each platform is therefore read with its
   * own table, and these tests pin which codes are ordinary endings on each.
   */
  function launchAndClose(platform: NodeJS.Platform, code: number): string[] {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child as never);
    setPlatform(platform);
    void showOsNotification({ title: 't', body: 'b' });
    child.emit('spawn');
    child.emit('close', code);
    spy.mockRestore();
    return errors;
  }

  // ntfytoast reports what the user did with the toast through its exit code,
  // so every one of these is the normal ending rather than a failure. Logging
  // an error for them would put a line in the log every time a banner expired.
  it.each([0, 1, 2, 3, 4, 5])('win32: stays quiet for user-outcome code %i', (code) => {
    expect(launchAndClose('win32', code)).toEqual([]);
  });

  /**
   * 4294967295 is 0xFFFFFFFF: Node's unsigned rendering of the Windows exit
   * code -1, which ntfytoast's own `-h` output labels `Failed`. Measured twice
   * coming out of an entirely ordinary `-d long` toast, about 60 seconds after
   * the banner appeared, so it belongs among the quiet outcomes above rather
   * than being logged as a failure every time a banner runs its course.
   */
  it('win32: stays quiet for the unsigned -1 a quietly-ending toast reports', () => {
    expect(launchAndClose('win32', 4294967295)).toEqual([]);
  });

  // terminal-notifier's table is different: 0 delivered, 4 timed out waiting on
  // a button, 6 no response. Everything else is a real failure.
  it.each([0, 4, 6])('darwin: stays quiet for ordinary code %i', (code) => {
    expect(launchAndClose('darwin', code)).toEqual([]);
  });

  /**
   * The one that matters: on macOS, raising a banner from a bundle the user has
   * not approved IS the permission prompt, and refusing it exits 3. Read with
   * the Windows table that is "timed out" — an ordinary ending — and the refusal
   * would vanish without a trace.
   */
  it('darwin: reports exit 3, which is a refused permission and not a timeout', () => {
    const errors = launchAndClose('darwin', 3);
    expect(errors.some((line) => line.includes('exited with 3'))).toBe(true);
  });

  // notify-send has no outcome codes at all: it either worked or it did not.
  it('linux: stays quiet only for 0', () => {
    expect(launchAndClose('linux', 0)).toEqual([]);
    expect(launchAndClose('linux', 1).some((l) => l.includes('exited with 1'))).toBe(true);
  });

  it('reports a code outside the user-outcome set', () => {
    const errors = launchAndClose('win32', 127);
    expect(errors.some((line) => line.includes('exited with 127'))).toBe(true);
  });

  /**
   * The outcome is handed to the caller rather than only logged, because that
   * is what lets a click be acted on and a refused permission be recorded.
   */
  it('hands the exit code and stdout to the caller', () => {
    const seen: Array<{ code: number | null; stdout: string }> = [];
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter };
    child.stdout = new EventEmitter();
    spawnMock.mockReturnValue(child as never);
    setPlatform('darwin');
    void showOsNotification({ title: 't', body: 'b' }, (outcome) => seen.push(outcome));
    child.emit('spawn');
    child.stdout.emit('data', Buffer.from('Open session\n'));
    child.emit('close', 0);
    expect(seen).toEqual([{ code: 0, stdout: 'Open session' }]);
  });
});

/**
 * What happens after the user drags our notifier out of ~/Applications.
 *
 * That folder is theirs, and nothing stops them tidying it. The install path is
 * decided once per process, so a remembered path that no longer leads anywhere
 * would make every later notification spawn a file that is gone — silently,
 * until the backend restarts. Worse, the failure produces an exit code, and a
 * caller reading that code for a permission answer would write down an answer
 * nobody gave.
 */
describe('a notifier the user deleted', () => {
  it('does not report an outcome when the notifier never ran', () => {
    const seen: unknown[] = [];
    const child = new EventEmitter();
    spawnMock.mockReturnValue(child as never);
    setPlatform('linux');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    void showOsNotification({ title: 't', body: 'b' }, (outcome) => seen.push(outcome));
    // spawn failed: the binary is not there.
    child.emit('error', new Error('spawn notify-send ENOENT'));
    child.emit('close', 1);
    spy.mockRestore();

    // An exit code born of the failure to launch is not the user answering.
    expect(seen).toEqual([]);
  });

  it('reinstalls instead of holding a path that no longer exists', () => {
    const home = mkdtempSync(join(tmpdir(), 'ccg-gone-'));
    homeOverride = home;
    const installed = join(home, 'Applications', 'Swttch Notifier.app');
    try {
      resetMacNotifierCache();
      setPlatform('darwin');
      spawnMock.mockReturnValue(new EventEmitter() as never);

      // First notification of the process: installs, and remembers where.
      void showOsNotification({ title: 't', body: 'b' });
      expect(existsSync(installed)).toBe(true);

      // The user drags it to the Trash.
      rmSync(installed, { recursive: true, force: true });

      // Second notification: the remembered path is gone, so it installs again
      // rather than spawning a file that is not there.
      void showOsNotification({ title: 't', body: 'b' });
      expect(existsSync(installed)).toBe(true);
    } finally {
      homeOverride = null;
      rmSync(home, { recursive: true, force: true });
    }
  });
});

/**
 * Whether the user asked to be taken back to their session.
 *
 * The two notifiers answer in different languages — macOS prints a line,
 * Windows uses the exit code — and both include endings that are NOT a request
 * to go anywhere. Reading a dismissal as a click would yank the IDE in front of
 * whatever the user deliberately turned to instead.
 */
describe('isClickToFocus', () => {
  describe('macOS', () => {
    const outcome = (stdout: string) => ({ code: 0, stdout });

    it('treats a click on the banner body as a request to focus', () => {
      setPlatform('darwin');
      expect(isClickToFocus(outcome('@ACTIONCLICKED'))).toBe(true);
    });

    it('treats the button the same as the body, since both mean "take me there"', () => {
      setPlatform('darwin');
      expect(isClickToFocus(outcome('Open session'))).toBe(true);
    });

    it('does not focus when the user dismissed the banner', () => {
      setPlatform('darwin');
      expect(isClickToFocus(outcome('@CLOSED'))).toBe(false);
    });

    it('does not focus when nobody touched it in time', () => {
      setPlatform('darwin');
      expect(isClickToFocus(outcome('@TIMEOUT'))).toBe(false);
    });

    it('does not focus on empty output', () => {
      setPlatform('darwin');
      expect(isClickToFocus(outcome(''))).toBe(false);
    });
  });

  describe('Windows', () => {
    const outcome = (code: number) => ({ code, stdout: '' });

    it('focuses on an activated toast and on a button press', () => {
      setPlatform('win32');
      expect(isClickToFocus(outcome(0))).toBe(true);
      expect(isClickToFocus(outcome(4))).toBe(true);
    });

    // 2 dismissed, 3 timed out, 1 suppressed by Focus Assist. None is a click.
    it.each([1, 2, 3])('does not focus on outcome code %i', (code) => {
      setPlatform('win32');
      expect(isClickToFocus(outcome(code))).toBe(false);
    });
  });

  /**
   * Measured against libnotify 0.8.1 with dunst 1.9.0. Every one of these ends
   * with exit code 0, so the code cannot tell them apart and stdout is the
   * whole signal.
   */
  describe('on Linux', () => {
    it('focuses when notify-send prints the action key back', () => {
      setPlatform('linux');
      expect(isClickToFocus({ code: 0, stdout: 'default' })).toBe(true);
    });

    it('does not focus when the banner was dismissed (empty stdout, exit 0)', () => {
      setPlatform('linux');
      expect(isClickToFocus({ code: 0, stdout: '' })).toBe(false);
    });

    it('does not focus when --expire-time ran out (empty stdout, exit 0)', () => {
      setPlatform('linux');
      // Same shape as a dismissal. Reading exit code 0 as "the user clicked"
      // would take the user to a session they never asked for, every time a
      // banner simply timed out.
      expect(isClickToFocus({ code: 0, stdout: '' })).toBe(false);
    });
  });
});

/**
 * The bundle identifier is read from the bundle, not written out in the code as
 * well.
 *
 * Two copies of one string is two things to keep in step, and their drifting
 * fails silently: we would ask macOS about one identifier while the banners
 * arrive under another, leaving the alert-style hint reading the wrong app for
 * good. It also lets the test harness rename the bundle, which is the only way
 * to see the permission prompt again — macOS remembers a granted identifier in
 * a database that surviving no uninstall.
 */
describe('macNotifierBundleId', () => {
  it('reads CFBundleIdentifier out of an Info.plist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ccg-plist-'));
    try {
      const plist = join(dir, 'Info.plist');
      writeFileSync(
        plist,
        '<?xml version="1.0"?><plist><dict>' +
          '<key>CFBundleName</key><string>Swttch</string>' +
          '<key>CFBundleIdentifier</key><string>com.example.notifier.t7</string>' +
          '</dict></plist>',
      );
      expect(readBundleIdentifier(plist)).toBe('com.example.notifier.t7');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back rather than throwing when the file is unreadable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(readBundleIdentifier('/nope/Info.plist')).toMatch(/^com\./);
    spy.mockRestore();
  });

  /**
   * Whatever it answers has to be the identifier of the bundle we actually
   * ship — that is the entire point of reading it from there. A hardcoded
   * string that happened to match today would pass a weaker test.
   */
  it('agrees with the bundle that ships in vendor', () => {
    const shipped = readBundleIdentifier(join(vendorDir(), 'Swttch Notifier.app', 'Contents', 'Info.plist'));
    expect(macNotifierBundleId()).toBe(shipped);
  });
});

/**
 * Registering a freshly installed bundle with LaunchServices, and WAITING for
 * it to finish.
 *
 * macOS takes a banner's icon from what LaunchServices knows about the bundle.
 * Fired and forgotten, the registration loses the race against the notification
 * it was meant to prepare, and the very first banner — the one that also asks
 * for permission, so the one the user looks hardest at — arrives wearing the
 * blank placeholder document icon. That is what happened the first time the
 * bundle identifier changed and the app became new to macOS again.
 */
describe('LaunchServices registration', () => {
  it('waits for lsregister rather than racing the notification it prepares', () => {
    const home = mkdtempSync(join(tmpdir(), 'ccg-lsreg-'));
    homeOverride = home;
    try {
      resetMacNotifierCache();
      setPlatform('darwin');
      spawnMock.mockReturnValue(new EventEmitter() as never);

      void showOsNotification({ title: 't', body: 'b' });

      // Synchronous by construction: async registration is the defect.
      const registered = spawnSyncMock.mock.calls.some(
        (call) => String(call[0]).endsWith('lsregister'),
      );
      expect(registered).toBe(true);
    } finally {
      homeOverride = null;
      rmSync(home, { recursive: true, force: true });
    }
  });
});

/**
 * Registering our AppUserModelID with Windows, which is what LaunchServices
 * registration is on macOS: the step that makes the OS treat the toast as ours.
 *
 * Measured on Windows 11 26200.9457. With `-appID "Swttch Notifier"` and
 * nothing having registered that id, the banner appears but the button asked
 * for with `-b` is
 * not drawn, and a click on the banner body ends the process with code 3
 * (TimedOut) instead of 4 (ButtonPressed) — so the click never reaches us and
 * the user never gets back to their session. Installing the Start Menu shortcut
 * that carries the id is what fixes both.
 */
describe('Windows AppUserModelID registration', () => {
  it('installs the Start Menu shortcut before raising the first toast', async () => {
    setPlatform('win32');
    let registeredBeforeSpawn = false;
    spawnMock.mockImplementation(() => {
      registeredBeforeSpawn = spawnSyncMock.mock.calls.some(isAppIdInstall);
      return spawnsFine();
    });

    await showOsNotification({ title: 't', body: 'b' });

    // Ordering is the point: a registration that lands after the toast is a
    // registration the toast did not benefit from.
    expect(registeredBeforeSpawn).toBe(true);
    const install = spawnSyncMock.mock.calls.find(isAppIdInstall);
    expect(install?.[0]).toBe(windowsNotifierExe());
    expect(install?.[1]).toEqual([
      '-install',
      WINDOWS_APP_ID,
      windowsNotifierExe(),
      WINDOWS_APP_ID,
    ]);
  });

  // Rewriting a shortcut that is already there costs a process launch per
  // banner and changes nothing.
  it('registers once per process rather than once per banner', async () => {
    setPlatform('win32');

    await showOsNotification({ title: 't', body: '1' });
    await showOsNotification({ title: 't', body: '2' });

    expect(spawnSyncMock.mock.calls.filter(isAppIdInstall)).toHaveLength(1);
    expect(spawnMock).toHaveBeenCalledTimes(2);
  });

  // Without the registration the banner still appears, which is most of what
  // the user came for. Losing it over a failed shortcut would trade the whole
  // notification for part of one.
  it('raises the banner anyway when the registration fails', async () => {
    setPlatform('win32');
    spawnSyncMock.mockImplementationOnce(() => {
      throw new Error('EACCES');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await showOsNotification({ title: 't', body: 'b' });

    spy.mockRestore();
    expect(spawnMock).toHaveBeenCalledWith(
      windowsNotifierExe(),
      buildWindowsNotifierArgs({ title: 't', body: 'b' }),
      { stdio: ['ignore', 'pipe', 'ignore'] },
    );
  });

  // The shortcut is a Windows concept; running it anywhere else would be one
  // stray process launch per backend start.
  it('does not run on the other platforms', async () => {
    setPlatform('darwin');
    const home = mkdtempSync(join(tmpdir(), 'ccg-noinstall-'));
    homeOverride = home;
    try {
      await showOsNotification({ title: 't', body: 'b' });
      setPlatform('linux');
      await showOsNotification({ title: 't', body: 'b' });

      expect(spawnSyncMock.mock.calls.filter(isAppIdInstall)).toEqual([]);
    } finally {
      homeOverride = null;
      rmSync(home, { recursive: true, force: true });
    }
  });
});

/**
 * One live notifier per session, not one per notification.
 *
 * A notifier with a click button stays alive for the whole click window. A
 * session that finishes ten turns while its user is away would leave ten of
 * them behind — and nine are waiting on banners macOS has already replaced,
 * because a new banner in the same group supersedes the previous one. Only the
 * newest can still be clicked.
 */
describe('live notifier bookkeeping', () => {
  function spawnable() {
    const child = new EventEmitter() as EventEmitter & { kill: () => void };
    child.kill = vi.fn();
    return child;
  }

  it('retires the previous notifier for the same session', () => {
    resetLiveNotifiers();
    setPlatform('linux');
    const first = spawnable();
    const second = spawnable();
    spawnMock.mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);

    void showOsNotification({ title: 't', body: '1', groupId: 'panel-7' });
    void showOsNotification({ title: 't', body: '2', groupId: 'panel-7' });

    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(second.kill).not.toHaveBeenCalled();
  });

  // Two sessions are two conversations; a banner from one must not silence the
  // other's.
  it('leaves another session\'s notifier alone', () => {
    resetLiveNotifiers();
    setPlatform('linux');
    const a = spawnable();
    const b = spawnable();
    spawnMock.mockReturnValueOnce(a as never).mockReturnValueOnce(b as never);

    void showOsNotification({ title: 't', body: 'a', groupId: 'panel-a' });
    void showOsNotification({ title: 't', body: 'b', groupId: 'panel-b' });

    expect(a.kill).not.toHaveBeenCalled();
    expect(b.kill).not.toHaveBeenCalled();
  });

  // Nothing supersedes an ungrouped banner, so there is nothing to retire.
  it('does not retire anything for a notification with no session', () => {
    resetLiveNotifiers();
    setPlatform('linux');
    const first = spawnable();
    const second = spawnable();
    spawnMock.mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);

    void showOsNotification({ title: 't', body: '1' });
    void showOsNotification({ title: 't', body: '2' });

    expect(first.kill).not.toHaveBeenCalled();
  });

  /**
   * A notifier that exits on its own is gone; killing it later would be killing
   * whatever process id the OS has since handed out.
   */
  it('forgets a notifier that exited, without retiring its replacement', () => {
    resetLiveNotifiers();
    setPlatform('linux');
    const first = spawnable();
    const second = spawnable();
    spawnMock.mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);

    void showOsNotification({ title: 't', body: '1', groupId: 'panel-7' });
    first.emit('close', 0);
    void showOsNotification({ title: 't', body: '2', groupId: 'panel-7' });

    // Already gone, so no kill was needed for it.
    expect(first.kill).not.toHaveBeenCalled();
    expect(second.kill).not.toHaveBeenCalled();
  });
});

/**
 * Clearing the quarantine flag on the installed copy.
 *
 * Without it desktop notifications do not work for anyone who installed the
 * plugin the normal way. The flag travels from the downloaded marketplace zip
 * into the plugin jar and into every file unpacked out of it; Gatekeeper answers
 * a quarantined ad-hoc-signed binary by killing it and offering to move it to
 * the Bin. Measured end to end from a zip marked the way Safari marks a
 * download — and nothing is logged when it happens, the process is just gone.
 *
 * Every local build is unquarantined already, so no amount of development
 * testing would have shown this.
 */
describe('quarantine on a downloaded plugin', () => {
  it('clears the flag on the copy it installs', () => {
    const home = mkdtempSync(join(tmpdir(), 'ccg-quar-'));
    homeOverride = home;
    try {
      resetMacNotifierCache();
      setPlatform('darwin');
      spawnMock.mockReturnValue(new EventEmitter() as never);

      void showOsNotification({ title: 't', body: 'b' });

      const cleared = spawnSyncMock.mock.calls.find((call) => call[0] === 'xattr');
      expect(cleared).toBeDefined();
      expect(cleared?.[1]).toEqual([
        '-dr',
        'com.apple.quarantine',
        join(home, 'Applications', 'Swttch Notifier.app'),
      ]);
    } finally {
      homeOverride = null;
      rmSync(home, { recursive: true, force: true });
    }
  });

  /**
   * Order matters: LaunchServices reads the bundle, and reading a quarantined
   * bundle is what the flag exists to prevent.
   */
  it('clears the flag before announcing the bundle to LaunchServices', () => {
    const home = mkdtempSync(join(tmpdir(), 'ccg-quar-order-'));
    homeOverride = home;
    try {
      resetMacNotifierCache();
      setPlatform('darwin');
      spawnMock.mockReturnValue(new EventEmitter() as never);

      void showOsNotification({ title: 't', body: 'b' });

      const commands = spawnSyncMock.mock.calls.map((call) => String(call[0]));
      const xattrAt = commands.indexOf('xattr');
      const lsregisterAt = commands.findIndex((c) => c.endsWith('lsregister'));
      expect(xattrAt).toBeGreaterThanOrEqual(0);
      expect(lsregisterAt).toBeGreaterThan(xattrAt);
    } finally {
      homeOverride = null;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
