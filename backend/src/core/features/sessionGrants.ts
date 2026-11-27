/**
 * What the user allowed "for this session", remembered so that the next CLI process of the session has it too (#761).
 *
 * The CLI keeps a `session` permission rule in its own process. This backend ends that process on its own for reasons
 * the user does not see as the end of a session (a setting that only applies at spawn, an account switch, a screen
 * that was closed and opened again), and the next one resumes the conversation without the rules. A terminal user
 * only loses them by ending the CLI, so we hand them back.
 *
 * Kept in memory only: they end with this backend, as the terminal's end with its process.
 *
 * Rules and folders go back through `--settings`, the documented flag, as a file: rule contents are shell commands, and
 * a file spares them the quoting a Windows command line would need. The `.claude` folder grant is the exception: no
 * flag or settings file brings it back (measured on CLI 2.1.332), so the new process is answered again when it asks.
 */
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import {
  CLAUDE_FOLDER_RULE,
  buildClaudeFolderPermissionUpdate,
  claudeFolderOf,
  type ClaudeFolder,
  type PermissionRule,
  type PermissionUpdate,
} from '../../shared';
import { ccgHomeDir } from '../../config/ccg-home';
import { isValidSessionId } from '../cli-registry';

interface Grants {
  rules: Set<string>;
  directories: Set<string>;
  claudeFolders: Set<ClaudeFolder>;
}

const grantsBySession = new Map<string, Grants>();

/** A rule as a settings file spells it. */
export function formatPermissionRule(rule: PermissionRule): string {
  if (rule.ruleContent === undefined) return rule.toolName;
  const content = rule.ruleContent.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  return `${rule.toolName}(${content})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function claudeFolderOfRule(rule: Record<string, unknown>): ClaudeFolder | undefined {
  if (rule.toolName !== 'Edit') return undefined;
  return (Object.keys(CLAUDE_FOLDER_RULE) as ClaudeFolder[]).find((folder) => CLAUDE_FOLDER_RULE[folder] === rule.ruleContent);
}

/**
 * Remember the session grants of an answer on its way to the CLI. [response] is the body of the `control_response`,
 * whoever built it (a card, a diff review, another session through the control route).
 */
export function recordSessionGrants(sessionId: string, response: Record<string, unknown>): void {
  const answer = response.response;
  if (!isRecord(answer) || answer.behavior !== 'allow' || !Array.isArray(answer.updatedPermissions)) return;

  const grants = grantsBySession.get(sessionId) ?? { rules: new Set<string>(), directories: new Set<string>(), claudeFolders: new Set<ClaudeFolder>() };
  for (const update of answer.updatedPermissions as unknown[]) {
    // Anything but `session` is written to a settings file by the CLI, which reads it back by itself.
    if (!isRecord(update) || update.destination !== 'session') continue;
    if (update.type === 'addRules' && update.behavior === 'allow' && Array.isArray(update.rules)) {
      for (const rule of update.rules as unknown[]) {
        if (!isRecord(rule) || typeof rule.toolName !== 'string' || rule.toolName === '') continue;
        const folder = claudeFolderOfRule(rule);
        if (folder) grants.claudeFolders.add(folder);
        else grants.rules.add(formatPermissionRule({ toolName: rule.toolName, ...(typeof rule.ruleContent === 'string' && { ruleContent: rule.ruleContent }) }));
      }
    } else if (update.type === 'addDirectories' && Array.isArray(update.directories)) {
      for (const directory of update.directories as unknown[]) {
        if (typeof directory === 'string' && directory !== '') grants.directories.add(directory);
      }
    }
  }
  if (grants.rules.size + grants.directories.size + grants.claudeFolders.size > 0) grantsBySession.set(sessionId, grants);
}

/**
 * The permission update that answers this request again, when it is about a file in a `.claude` folder the session was
 * already allowed. Null otherwise, and the request goes to the user as it is.
 */
export function claudeFolderGrantFor(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  workingDir: string | undefined,
  homeDir: string,
): PermissionUpdate[] | null {
  const granted = grantsBySession.get(sessionId)?.claudeFolders;
  if (!granted?.size) return null;
  const folder = claudeFolderOf(toolName, input, workingDir, homeDir);
  return folder && granted.has(folder) ? buildClaudeFolderPermissionUpdate(folder) : null;
}

/** `CCG_HOME/permissions/<sessionId>.json`, beside the session MCP configs. Null for an id that is not a file name. */
function settingsPath(env: NodeJS.ProcessEnv, sessionId: string): string | null {
  if (!isValidSessionId(sessionId)) return null;
  return resolve(ccgHomeDir(env), 'permissions', `${sessionId}.json`);
}

/**
 * Write the settings file for the next CLI process of this session and return its path, or null when there is nothing
 * to hand back or it could not be written. A failure costs a repeated question, never the chat.
 */
export function writeSessionGrantSettings(env: NodeJS.ProcessEnv, sessionId: string): string | null {
  const grants = grantsBySession.get(sessionId);
  if (!grants || grants.rules.size + grants.directories.size === 0) return null;
  try {
    const file = settingsPath(env, sessionId);
    if (!file) throw new Error(`Not a usable session id: ${sessionId}`);
    mkdirSync(dirname(file), { recursive: true });
    const permissions = {
      ...(grants.rules.size > 0 && { allow: [...grants.rules] }),
      ...(grants.directories.size > 0 && { additionalDirectories: [...grants.directories] }),
    };
    // Owner only: a rule can name a command, and a command can carry anything.
    writeFileSync(file, JSON.stringify({ permissions }), { encoding: 'utf8', mode: 0o600 });
    return file;
  } catch (err) {
    console.error('[node-backend]', 'Starting without the session’s permission grants, they were not written:', err);
    return null;
  }
}

/** Remove a session's settings file once the CLI it was written for is gone. */
export function removeSessionGrantSettings(env: NodeJS.ProcessEnv, sessionId: string): void {
  try {
    const file = settingsPath(env, sessionId);
    if (file) rmSync(file, { force: true });
  } catch (err) {
    console.error('[node-backend]', 'Session permission settings remove failed:', err);
  }
}

const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** Remove files a backend that ended without running its exit code left behind. Judged by age alone. */
export function sweepStaleSessionGrantSettings(env: NodeJS.ProcessEnv = process.env): void {
  const dir = resolve(ccgHomeDir(env), 'permissions');
  try {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const file = resolve(dir, name);
      if (Date.now() - statSync(file).mtimeMs > STALE_AFTER_MS) rmSync(file, { force: true });
    }
  } catch (err) {
    console.error('[node-backend]', 'Session permission settings sweep failed:', err);
  }
}

/** Forget everything. For tests. */
export function clearSessionGrants(): void {
  grantsBySession.clear();
}
