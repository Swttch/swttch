import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { consoleSafeExecOptions } from '../console-safe';

describe('consoleSafeExecOptions', () => {
  it('adds windowsHide to nothing', () => {
    expect(consoleSafeExecOptions()).toEqual({ windowsHide: true });
  });

  it('keeps the caller options next to windowsHide', () => {
    expect(consoleSafeExecOptions({ cwd: 'C:\\proj', timeout: 5 })).toEqual({
      cwd: 'C:\\proj',
      timeout: 5,
      windowsHide: true,
    });
  });

  it('accepts undefined options, the way an optional parameter arrives', () => {
    expect(consoleSafeExecOptions(undefined)).toEqual({ windowsHide: true });
  });

  it('cannot be switched off by the caller options', () => {
    expect(consoleSafeExecOptions({ windowsHide: false })).toEqual({ windowsHide: true });
  });

  it('does not change the object it was given', () => {
    const given = { cwd: '/x' };
    consoleSafeExecOptions(given);
    expect(given).toEqual({ cwd: '/x' });
  });
});

/**
 * #539: a console program started without `windowsHide` flashes a black window on Windows.
 * The same omission was in five places and nobody noticed, because the test machine is a Mac.
 *
 * This reads the source and fails when a spawn call has neither `windowsHide` nor
 * `consoleSafeExecOptions` in its argument list, so a sixth place cannot arrive unnoticed.
 *
 * A call that is deliberately left out goes in EXEMPT with the reason. The reason has to be
 * one of two kinds: the program never runs on Windows, or the whole point of the spawn is to
 * put a window in front of the user (`windowsHide` would hide that window too).
 */
const BACKEND_SRC = join(__dirname, '..', '..');

const SPAWN_CALL = /(?<![.\w])(execFile|execFileSync|execFileAsync|spawn|spawnSync|cpSpawn|cpExecFile)\(/g;

const EXEMPT: Record<string, string> = {
  // The bridge opens things in front of the user on purpose: terminals, editors, folder and
  // file dialogs, the browser. windowsHide would hide the window the user asked for.
  'bridge/browser-bridge.ts': 'opens windows for the user',
  'core/handlers/openFolderDialog.ts': 'folder dialog is the window the user asked for',
  'core/features/appDetection/openAtLine.ts': "launches the user's editor, a GUI program",
  // Only ever run on macOS or Linux.
  'core/os-info.ts': 'sw_vers / lsb_release, never on Windows',
  'core/features/fileIconMac.ts': 'macOS only',
  'core/features/fileIconLinux.ts': 'Linux only',
  'system-notifications/alert-style.ts': 'macOS notification settings only',
  'system-sounds/player.ts': 'afplay / paplay / aplay are POSIX; the one Windows call (powershell) sets windowsHide',
};

/**
 * Programs that exist on macOS or Linux only. A call that names one of them literally never
 * runs on Windows, so a missing `windowsHide` there cannot flash anything.
 */
const POSIX_ONLY_PROGRAMS = new Set([
  'lsof', 'pgrep', 'ps', 'which', 'defaults', 'mdls', 'xattr', 'open', 'sudo', 'pmset',
  'caffeinate', 'afplay', 'paplay', 'aplay', 'osascript', 'xdg-open', 'zenity', 'sw_vers',
  '/usr/bin/security', '/usr/bin/osascript', 'systemd-inhibit', 'LSREGISTER', 'SUDO', 'PMSET',
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'test-harness') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

/** The text of one call, from its opening paren to the matching close paren. */
function callText(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

describe('every spawn that captures output hides its console on Windows (#539)', () => {
  it('has windowsHide or consoleSafeExecOptions in each spawn call', () => {
    const missing: string[] = [];
    for (const file of sourceFiles(BACKEND_SRC)) {
      const rel = relative(BACKEND_SRC, file).split(sep).join('/');
      if (rel in EXEMPT) continue;
      const source = readFileSync(file, 'utf8');
      const fileHidesConsole = /windowsHide|consoleSafeExecOptions/.test(source);
      for (const m of source.matchAll(SPAWN_CALL)) {
        const lineStart = source.lastIndexOf('\n', m.index!) + 1;
        const before = source.slice(lineStart, m.index);
        // A comment that mentions `spawn()`, or the declaration of a method named spawn.
        if (/^\s*(\/\/|\*|\/\*)/.test(before) || /(static|async|function)\s+$/.test(before)) continue;

        const text = callText(source, m.index! + m[0].length - 1);
        // A method declaration without a modifier: `spawn(options?: SpawnOptions) {`.
        if (/^\(\s*\w+\??:\s/.test(text)) continue;
        if (/windowsHide|consoleSafeExecOptions/.test(text)) continue;
        // The options were built beforehand in a variable (`execOptions`, `gitOpts`) and the
        // file builds them with the helper. The variable's definition is what carries the flag.
        if (fileHidesConsole && /,\s*\w*(options|opts)\b/i.test(text)) continue;
        const program = /^\(\s*['"`]([^'"`]+)['"`]|^\(\s*(\w+)/.exec(text);
        if (program && POSIX_ONLY_PROGRAMS.has(program[1] ?? program[2])) continue;

        const line = source.slice(0, m.index).split('\n').length;
        missing.push(`${rel}:${line}  ${m[1]}(${text.slice(1, 60).replace(/\s+/g, ' ')}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
