import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildSessionPermissionUpdate,
  buildClaudeFolderPermissionUpdate,
  type AnyPermissionUpdate,
} from '../../../shared';
import {
  clearSessionGrants,
  claudeFolderGrantFor,
  formatPermissionRule,
  recordSessionGrants,
  removeSessionGrantSettings,
  sweepStaleSessionGrantSettings,
  writeSessionGrantSettings,
} from '../sessionGrants';

// #761: a session rule lives in the CLI process. These are what brings it back to the next process of the session.

const allow = (updatedPermissions: AnyPermissionUpdate[]) => ({
  subtype: 'success',
  request_id: 'r1',
  response: { behavior: 'allow', updatedInput: {}, updatedPermissions },
});

let home: string;
const env = () => ({ CCG_HOME: home });
const written = (sessionId = 'sess-1') => {
  const file = writeSessionGrantSettings(env(), sessionId);
  return file ? JSON.parse(readFileSync(file, 'utf8')) : null;
};

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'grants-'));
  clearSessionGrants();
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('formatPermissionRule', () => {
  it('writes a whole-tool rule as the tool name and a narrow one with its content', () => {
    expect(formatPermissionRule({ toolName: 'Edit' })).toBe('Edit');
    expect(formatPermissionRule({ toolName: 'Read', ruleContent: '//tmp/a/**' })).toBe('Read(//tmp/a/**)');
  });

  // Measured on CLI 2.1.332: only this spelling matched a command with both a backslash and parentheses.
  it('escapes backslashes and parentheses in the content', () => {
    expect(formatPermissionRule({ toolName: 'Bash', ruleContent: 'touch \\(x\\).txt' })).toBe('Bash(touch \\\\\\(x\\\\\\).txt)');
    expect(formatPermissionRule({ toolName: 'Bash', ruleContent: 'touch "a)b"' })).toBe('Bash(touch "a\\)b")');
  });
});

describe('recordSessionGrants and the settings file for the next process', () => {
  it('has nothing to write for a session that granted nothing', () => {
    expect(writeSessionGrantSettings(env(), 'sess-1')).toBeNull();
  });

  it('keeps the session rules and folders, adding up over several answers', () => {
    recordSessionGrants('sess-1', allow(buildSessionPermissionUpdate('Edit')));
    recordSessionGrants('sess-1', allow([
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'ls:*' }], behavior: 'allow', destination: 'session' },
      { type: 'addDirectories', directories: ['/outside'], destination: 'session' },
    ]));
    recordSessionGrants('sess-1', allow(buildSessionPermissionUpdate('Edit')));

    expect(written()).toEqual({
      permissions: {
        allow: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash(ls:*)'],
        additionalDirectories: ['/outside'],
      },
    });
  });

  it('keeps one session’s grants from another', () => {
    recordSessionGrants('sess-1', allow(buildSessionPermissionUpdate('Bash')));
    expect(writeSessionGrantSettings(env(), 'sess-2')).toBeNull();
  });

  it('leaves out what the CLI keeps itself, a mode change, a denial, and an answer without permissions', () => {
    recordSessionGrants('sess-1', allow([
      { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'x' }], behavior: 'allow', destination: 'localSettings' },
      { type: 'setMode', mode: 'acceptEdits', destination: 'session' } as never,
      { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'deny', destination: 'session' } as never,
    ]));
    recordSessionGrants('sess-1', { subtype: 'success', request_id: 'r2', response: { behavior: 'deny', updatedPermissions: buildSessionPermissionUpdate('Bash') } });
    recordSessionGrants('sess-1', { subtype: 'success', request_id: 'r3', response: { behavior: 'allow' } });
    recordSessionGrants('sess-1', { subtype: 'success', request_id: 'r4' });

    expect(writeSessionGrantSettings(env(), 'sess-1')).toBeNull();
  });

  it('refuses a session id that is not a file name, and removes the file it wrote', () => {
    recordSessionGrants('../x', allow(buildSessionPermissionUpdate('Bash')));
    expect(writeSessionGrantSettings(env(), '../x')).toBeNull();

    recordSessionGrants('sess-1', allow(buildSessionPermissionUpdate('Bash')));
    const file = writeSessionGrantSettings(env(), 'sess-1')!;
    expect(existsSync(file)).toBe(true);
    removeSessionGrantSettings(env(), 'sess-1');
    expect(existsSync(file)).toBe(false);
  });

  it('sweeps files nobody came back for, and only those', () => {
    recordSessionGrants('old', allow(buildSessionPermissionUpdate('Bash')));
    recordSessionGrants('new', allow(buildSessionPermissionUpdate('Bash')));
    const old = writeSessionGrantSettings(env(), 'old')!;
    const fresh = writeSessionGrantSettings(env(), 'new')!;
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    utimesSync(old, past, past);

    sweepStaleSessionGrantSettings(env());

    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });
});

// The one grant no flag brings back (measured): it is answered again when the new process asks.
describe('claudeFolderGrantFor', () => {
  const ask = (path: string, sessionId = 'sess-1', toolName = 'Write') =>
    claudeFolderGrantFor(sessionId, toolName, { file_path: path }, '/repo', '/home/me');

  it('answers a request inside a folder the session was allowed', () => {
    recordSessionGrants('sess-1', allow(buildClaudeFolderPermissionUpdate('project')));
    expect(ask('/repo/.claude/a.md')).toEqual(buildClaudeFolderPermissionUpdate('project'));
  });

  it('is not part of the settings file, which cannot carry it', () => {
    recordSessionGrants('sess-1', allow(buildClaudeFolderPermissionUpdate('project')));
    expect(writeSessionGrantSettings(env(), 'sess-1')).toBeNull();
  });

  it('answers nothing for the other folder, another session, a file outside, or a read', () => {
    recordSessionGrants('sess-1', allow(buildClaudeFolderPermissionUpdate('project')));
    expect(ask('/home/me/.claude/a.md')).toBeNull();
    expect(ask('/repo/.claude/a.md', 'sess-2')).toBeNull();
    expect(ask('/repo/src/a.md')).toBeNull();
    expect(ask('/repo/.claude/a.md', 'sess-1', 'Read')).toBeNull();
  });

  it('answers nothing until the user allowed it', () => {
    expect(ask('/repo/.claude/a.md')).toBeNull();
  });
});
