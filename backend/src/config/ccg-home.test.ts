import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { homedir } from 'os';
import { ccgHomeDir, ideSharedDir } from './ccg-home';

describe('ideSharedDir', () => {
  it('stays the default folder when CCG_HOME is set', () => {
    const saved = process.env.CCG_HOME;
    try {
      process.env.CCG_HOME = '/data/ccg';
      expect(ideSharedDir()).toBe(join(homedir(), '.claude-code-gui'));
    } finally {
      if (saved === undefined) delete process.env.CCG_HOME;
      else process.env.CCG_HOME = saved;
    }
  });
});

describe('ccgHomeDir', () => {
  it('defaults to ~/.claude-code-gui', () => {
    expect(ccgHomeDir({})).toBe(join(homedir(), '.claude-code-gui'));
  });

  it('follows CCG_HOME when it is set', () => {
    expect(ccgHomeDir({ CCG_HOME: '/data/ccg' })).toBe('/data/ccg');
  });

  it('ignores a blank CCG_HOME', () => {
    expect(ccgHomeDir({ CCG_HOME: '   ' })).toBe(join(homedir(), '.claude-code-gui'));
    expect(ccgHomeDir({ CCG_HOME: '' })).toBe(join(homedir(), '.claude-code-gui'));
  });

  it('trims the value', () => {
    expect(ccgHomeDir({ CCG_HOME: '  /data/ccg  ' })).toBe('/data/ccg');
  });

  it('reads the environment on every call', () => {
    const saved = process.env.CCG_HOME;
    try {
      process.env.CCG_HOME = '/first';
      expect(ccgHomeDir()).toBe('/first');
      process.env.CCG_HOME = '/second';
      expect(ccgHomeDir()).toBe('/second');
    } finally {
      if (saved === undefined) delete process.env.CCG_HOME;
      else process.env.CCG_HOME = saved;
    }
  });
});

// Every store that keeps user data must resolve its folder through ccgHomeDir(). A store that
// builds `~/.claude-code-gui` itself ignores CCG_HOME, and a user who set it finds that store
// split from the rest of their data. This scan fails the moment someone adds one.
describe('no store builds the user-data folder on its own', () => {
  const srcRoot = join(__dirname, '..');

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        return name === 'node_modules' || name === 'vendor' || name === '__tests__' ? [] : sourceFiles(path);
      }
      return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
    });
  }

  // A line that names the folder is fine when it is not the user-data folder: a folder inside a
  // project, the old location a migration reads from, or a form that already honours CCG_HOME.
  const ALLOWED = ['CCG_HOME', 'projectPath', 'workingDir', 'legacyHome', 'LEGACY_DIR_NAME', 'ccgHomeDir'];

  it('finds the folder name only where it is allowed', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(srcRoot)) {
      if (file.endsWith('ccg-home.ts')) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
        if (!/['"`]\.claude-code-gui['"`]/.test(code)) return;
        if (ALLOWED.some((word) => code.includes(word))) return;
        offenders.push(`${relative(srcRoot, file)}:${index + 1}  ${code}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
