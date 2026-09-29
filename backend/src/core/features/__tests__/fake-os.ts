import { EventEmitter } from 'events';
import { vi } from 'vitest';

/**
 * A stand-in for the operating system's power settings, held as real state.
 *
 * The sleep guard's contract is about what happens to the user's settings, so the
 * tests judge it by reading the settings back, not by asserting which commands were
 * spelled how. Every mocked `child_process` entry point funnels into `run`, the only
 * place a setting can change: any route to a setting, by any author, shows up as
 * the setting moving.
 */

export const SCHEME_A = '381b4222-f694-41f0-9685-ff5bb260df2e';
export const SCHEME_B = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';

export class FakeProcess extends EventEmitter {
  stdin = Object.assign(new EventEmitter(), { unref: vi.fn() });
  stdout = Object.assign(new EventEmitter(), { unref: vi.fn() });
  stderr = Object.assign(new EventEmitter(), { unref: vi.fn() });
  pid = 4321;
  unref = vi.fn();
  kill = vi.fn();
}

interface Fns {
  spawn: ReturnType<typeof vi.fn>;
  spawnSync: ReturnType<typeof vi.fn>;
}

export type HelperBehavior = 'ready' | 'dies' | 'silent';

export function createFakeOs(fns: Fns) {
  const os = {
    /** macOS: `pmset -g` SleepDisabled. */
    sleepDisabled: 0,
    /** macOS: whether the sudoers rule is installed. */
    authorized: true,
    /** macOS: what the authorization dialog does when asked. */
    dialog: 'accept' as 'accept' | 'cancel',
    dialogs: 0,
    /** Windows: the active power plan and each plan's lid close action (0 nothing, 1 sleep). */
    activeScheme: SCHEME_A,
    lid: { [SCHEME_A]: { ac: 1, dc: 1 }, [SCHEME_B]: { ac: 1, dc: 1 } } as Record<string, { ac: number; dc: number }>,
    /** Windows: standby timeouts in seconds. Sleep prevention must never touch them. */
    standby: { ac: 0, dc: 600 },
    helperBehavior: 'ready' as HelperBehavior,
    /** Every command line either entry point was asked to run. */
    commands: [] as string[],
    helper: null as FakeProcess | null,
    helpers: [] as FakeProcess[],
    /** The helper the last spawn produced, with its command line. */
    lastSpawn: '',
  };

  const hex = (n: number): string => `0x${n.toString(16).padStart(8, '0')}`;

  function run(command: string, args: string[]): { status: number; stdout: string; stderr: string } {
    const line = [command, ...args].join(' ');
    os.commands.push(line);
    const ok = (stdout = ''): { status: number; stdout: string; stderr: string } => ({ status: 0, stdout, stderr: '' });

    if (command === '/usr/bin/pmset' && args[0] === '-g') return ok(`System-wide power settings:\n SleepDisabled\t\t${os.sleepDisabled}\n`);
    if (command === '/usr/bin/sudo') {
      const value = Number(args[args.length - 1]);
      if (!os.authorized) return { status: 1, stdout: '', stderr: 'sudo: a password is required\n' };
      os.sleepDisabled = value;
      return ok();
    }

    if (command === 'powercfg') {
      if (args[0] === '/getactivescheme') return ok(`Power Scheme GUID: ${os.activeScheme}  (Balanced)\n`);
      if (args[0] === '/qh') {
        const plan = os.lid[args[1]];
        // A localized Windows prints these words in its own language. The tokens
        // "AC" and "DC" and the hex value are what stays put.
        return ok([
          `  Power Setting GUID: 5ca83367  (Lid close action)`,
          `    Current AC Power Setting Index: ${hex(plan.ac)}`,
          `    Current DC Power Setting Index: ${hex(plan.dc)}`,
        ].join('\n'));
      }
      if (args[0] === '/setacvalueindex') { os.lid[args[1]].ac = Number(args[4]); return ok(); }
      if (args[0] === '/setdcvalueindex') { os.lid[args[1]].dc = Number(args[4]); return ok(); }
      if (args[0] === '/setactive') return ok();
      // Anything about standby is the sleep timeout: report it, and let a test see if it moved.
      if (/standby-timeout-ac/.test(line)) os.standby.ac = Number(args[args.length - 1]) * 60;
      if (/standby-timeout-dc/.test(line)) os.standby.dc = Number(args[args.length - 1]) * 60;
    }
    return ok();
  }

  fns.spawnSync.mockImplementation(((command: string, args: string[] = []) => run(command, args)) as never);

  fns.spawn.mockImplementation(((command: string, args: string[] = []) => {
    const line = [command, ...args].join(' ');
    os.commands.push(line);
    os.lastSpawn = line;
    const proc = new FakeProcess();

    if (command === '/usr/bin/osascript') {
      os.dialogs += 1;
      queueMicrotask(() => {
        if (os.dialog === 'cancel') {
          proc.stderr.emit('data', Buffer.from('execution error: User canceled. (-128)'));
          proc.emit('exit', 1, null);
        } else {
          os.authorized = true;
          proc.emit('exit', 0, null);
        }
      });
      return proc;
    }

    os.helper = proc;
    os.helpers.push(proc);
    if (/powershell/i.test(command)) {
      queueMicrotask(() => {
        if (os.helperBehavior === 'ready') proc.stdout.emit('data', Buffer.from('CCG_SLEEP_GUARD_READY\n'));
        else if (os.helperBehavior === 'dies') {
          proc.stderr.emit('data', Buffer.from('Add-Type : Cannot compile in this language mode\n'));
          proc.emit('exit', 1, null);
        }
      });
    }
    return proc;
  }) as never);

  return os;
}

export type FakeOs = ReturnType<typeof createFakeOs>;

type Handler = () => void;

/**
 * Import sleep-guard fresh (its state lives in module scope) on a chosen platform,
 * capturing the `process.on` registrations it makes so a test can run the exit
 * handlers directly without disturbing the listeners vitest and Node hold.
 */
export async function loadSleepGuard(platform: NodeJS.Platform) {
  vi.resetModules();
  const platformSpy = vi.spyOn(process, 'platform', 'get');
  platformSpy.mockReturnValue(platform);
  const handlers = new Map<string, Handler[]>();
  const onSpy = vi.spyOn(process, 'on').mockImplementation(((event: string, handler: Handler) => {
    handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    return process;
  }) as never);
  const mod = await import('../sleep-guard');
  onSpy.mockRestore();
  return {
    mod,
    runHandlers: (event: string): void => { for (const h of handlers.get(event) ?? []) h(); },
    restorePlatform: (): void => platformSpy.mockRestore(),
  };
}
