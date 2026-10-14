import { homedir } from 'os';
import { join } from 'path';
import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { readSettingsFile, readProjectSettings } from '../features/settings';
import { expandHomeDir } from '../features/claudeConfigDir';
import { Claude } from '../claude';
import { MessageType } from '../../shared';

/** Pull a non-empty CLAUDE_CONFIG_DIR string out of a settings object's `env` map. */
function envConfigDir(settings: Record<string, unknown>): string | null {
  const env = settings.env;
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    const value = (env as Record<string, unknown>).CLAUDE_CONFIG_DIR;
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/**
 * Report the Claude config directory state to the settings UI:
 * - effective: the directory currently in use (process.env, after any override)
 * - globalSetting / projectSetting: values declared in the plugin settings `env` map
 * - inherited: the value the backend inherited from the environment at startup
 *   (lets the UI offer to persist a transiently-set value). (#123)
 */
export async function getClaudeConfigDirHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const workingDir = message.payload?.workingDir as string | undefined;
  const scope = (message.payload?.scope as 'global' | 'project' | undefined) === 'project'
    ? 'project'
    : 'global';
  const global = await readSettingsFile();
  const project = workingDir ? await readProjectSettings(workingDir) : {};

  const globalSetting = envConfigDir(global);
  const projectSetting = envConfigDir(project);
  const inherited = Claude.inheritedClaudeConfigDir ?? null;
  const fallback = inherited ?? join(homedir(), '.claude');

  // `effective` reflects the SELECTED scope, computed from the files (never process.env,
  // which holds whatever context loaded last):
  // - global tab: only the global setting counts; project is ignored
  // - project tab: project overrides global, then the shared fallbacks
  // This is why the global tab shows ~/.claude even when a project sets a value. (#123)
  // Expanded the same way Claude.applyConfigDir expands it before the CLI sees it, so the
  // path shown is the one the CLI actually receives (#538).
  const effective = expandHomeDir(scope === 'project'
    ? (projectSetting ?? globalSetting ?? fallback)
    : (globalSetting ?? fallback));

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    effective,
    globalSetting,
    projectSetting,
    inherited,
  });
}
