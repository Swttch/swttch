import { describe, it, expect, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { getClaudeConfigDir, expandHomeDir } from '../claudeConfigDir';

/**
 * The CLI hashes the config directory string into the name of its keychain item
 * (`Claude Code-credentials-<hash>`), so the string we hand it must be character for
 * character the one a shell would have produced from the same `~` — no normalising.
 */
describe('expandHomeDir', () => {
  const home = '/Users/someone';

  it('replaces a leading ~ followed by a slash with the home directory', () => {
    expect(expandHomeDir('~/.claude-work', home)).toBe('/Users/someone/.claude-work');
  });

  it('replaces a lone ~ with the home directory', () => {
    expect(expandHomeDir('~', home)).toBe(home);
  });

  it('keeps every other character as typed, as a shell does', () => {
    expect(expandHomeDir('~/.claude-work/', home)).toBe('/Users/someone/.claude-work/');
    expect(expandHomeDir('~//a', home)).toBe('/Users/someone//a');
    expect(expandHomeDir('~/a/../b', home)).toBe('/Users/someone/a/../b');
    // A home with a trailing slash is concatenated verbatim, as `$HOME/…` is.
    expect(expandHomeDir('~/x', '/Users/someone/')).toBe('/Users/someone//x');
  });

  it('leaves values that do not start with ~ followed by a separator untouched', () => {
    expect(expandHomeDir('/Users/other/.claude-work', home)).toBe('/Users/other/.claude-work');
    expect(expandHomeDir('~other/.claude-work', home)).toBe('~other/.claude-work');
    expect(expandHomeDir('a/~/b', home)).toBe('a/~/b');
    expect(expandHomeDir('D:\\Claude', home)).toBe('D:\\Claude');
    expect(expandHomeDir('', home)).toBe('');
  });

  it('leaves the value as typed when the home directory is empty', () => {
    // `HOME=` makes os.homedir() answer "" — expanding then would turn ~/x into /x.
    expect(expandHomeDir('~/.claude-work', '')).toBe('~/.claude-work');
    expect(expandHomeDir('~', '')).toBe('~');
  });
});

describe('getClaudeConfigDir', () => {
  const original = process.env.CLAUDE_CONFIG_DIR;

  afterEach(() => {
    if (original === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = original;
  });

  it('defaults to ~/.claude when CLAUDE_CONFIG_DIR is unset', () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(getClaudeConfigDir()).toBe(join(homedir(), '.claude'));
  });

  it('returns CLAUDE_CONFIG_DIR when set to a custom location', () => {
    process.env.CLAUDE_CONFIG_DIR = join('D:', 'Claude');
    expect(getClaudeConfigDir()).toBe(join('D:', 'Claude'));
  });
});
