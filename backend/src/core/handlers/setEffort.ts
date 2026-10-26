import type { ConnectionManager } from '../../ws/connection-manager';
import type { Bridge } from '../../bridge/bridge-interface';
import type { IPCMessage } from '../types';
import { MessageType } from '../../shared';
import { applyEffortToLiveCli, type EffortChange } from '../features/effort-runtime';
import { readMergedClaudeSettings, saveClaudeSetting } from '../features/claude-settings';
import { canonicalModelName, isPersistableEffortLevel, saveModelEffortLevel } from '../features/model-effort-setting';
import { resolveLegacyEffortLevel } from '../claude-process';

/**
 * The CLI's effort vocabulary is its own to grow (`max` joined the flag before the
 * settings file), so the level is checked for shape, not against a list. The shape
 * matters: on the fallback path the level is written into a `/effort` command.
 */
const EFFORT_LEVEL_SHAPE = /^[a-z]{2,16}$/;

interface SetEffortPayload {
  effortLevel?: string | null;
  ultracode?: boolean;
  /** The model the level is picked for, as the model picker names it. Absent or an alias: the pick is not stored. */
  model?: string | null;
  /** Models that keep the old top-level level as one of their own, when this pick is the first per-model level. */
  inheritLegacy?: unknown;
}

/** The project folder of the session, so project-level settings are merged in as the CLI will see them. */
function workingDirOf(connections: ConnectionManager, sessionId: string | null | undefined): string | undefined {
  return (sessionId && connections.getSession(sessionId)?.workingDir) || undefined;
}

/** The models asked to keep the old top-level level: canonical names only, never the picked model, at most 32. */
function parseInheritLegacy(value: unknown, pickedModel: string | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  const picked = canonicalModelName(pickedModel);
  const names = new Set<string>();
  for (const item of value) {
    const name = typeof item === 'string' ? canonicalModelName(item) : null;
    if (name && name !== picked) names.add(name);
    if (names.size >= 32) break;
  }
  return [...names];
}

/** The change the payload asks for, or null when it asks for nothing or something malformed. */
function parseChange(payload: SetEffortPayload | undefined): EffortChange | null {
  if (!payload) return null;
  const change: EffortChange = {};
  if (payload.effortLevel !== undefined) {
    if (payload.effortLevel !== null && !EFFORT_LEVEL_SHAPE.test(payload.effortLevel)) return null;
    change.effortLevel = payload.effortLevel;
  }
  if (payload.ultracode !== undefined) {
    if (typeof payload.ultracode !== 'boolean') return null;
    change.ultracode = payload.ultracode;
  }
  return change.effortLevel === undefined && change.ultracode === undefined ? null : change;
}

/**
 * SET_EFFORT: the slider moved. Store the pick, remember it for the session, and tell the live CLI.
 *
 * - Stored for the model, as `modelSettings.<model>.effortLevel` (or removed, for Auto), so a CLI started
 *   later by any chat reads it itself and the other models keep the levels they have (#604).
 * - Remembered for the session, so every CLI this session spawns is started with it as `--effort`. That is
 *   what makes a `max` pick last (the settings file cannot hold it) and what keeps a pick in force over a
 *   `modelSettings` entry in a project file.
 * - Told to the CLI that is running now. See effort-runtime.ts for how and why.
 *
 * Auto drops both the stored entry and the session's pick, so the next CLI is started with no flag and the
 * level is the CLI's to decide.
 */
export async function setEffortHandler(
  connectionId: string,
  message: IPCMessage,
  connections: ConnectionManager,
  _bridge: Bridge,
): Promise<void> {
  const change = parseChange(message.payload as SetEffortPayload | undefined);
  if (!change) {
    connections.sendTo(connectionId, MessageType.ACK, {
      requestId: message.requestId,
      status: 'error',
      error: 'a valid effortLevel and/or ultracode is required',
    });
    return;
  }

  const sessionId = connections.getClient(connectionId)?.subscribedSessionId;
  const model = (message.payload as SetEffortPayload).model;

  let persisted = false;
  if (change.effortLevel !== undefined) {
    // The old top-level level, read before this pick adds the first level of a model of its own and ends it.
    const inherit = parseInheritLegacy((message.payload as SetEffortPayload).inheritLegacy, model);
    const legacy = typeof change.effortLevel === 'string' && inherit.length > 0
      ? resolveLegacyEffortLevel((await readMergedClaudeSettings(workingDirOf(connections, sessionId))).settings)
      : undefined;
    const saved = await saveModelEffortLevel(model, change.effortLevel);
    if (saved.status === 'error') {
      connections.sendTo(connectionId, MessageType.ACK, {
        requestId: message.requestId,
        status: 'error',
        error: saved.error,
      });
      return;
    }
    persisted = saved.persisted;
    // The first per-model level ends the top-level one, which reached every model as a flag until now and
    // is ignored by the CLI itself. Each other model keeps it as a level of its own, so none of them
    // falls to the model default the moment one model is picked (#604).
    if (legacy !== undefined && persisted && isPersistableEffortLevel(legacy)) {
      for (const name of inherit) {
        const kept = await saveModelEffortLevel(name, legacy);
        if (kept.status === 'error') {
          connections.sendTo(connectionId, MessageType.ACK, {
            requestId: message.requestId,
            status: 'error',
            error: kept.error,
          });
          return;
        }
      }
    }
    // Auto also retires the top-level `effortLevel`, as it always did (the slider used to write null there).
    // Left in place it would come back as the legacy flag at the next spawn (resolveLegacyEffortLevel) and
    // Auto would not be Auto.
    if (change.effortLevel === null) {
      const cleared = await saveClaudeSetting('effortLevel', null);
      if (cleared.status === 'error') {
        connections.sendTo(connectionId, MessageType.ACK, {
          requestId: message.requestId,
          status: 'error',
          error: cleared.error,
        });
        return;
      }
      persisted = true;
    }
    // A chat that has sent nothing has no session yet: the pick waits on the connection for the first spawn.
    if (sessionId) connections.setEffortPick(sessionId, change.effortLevel);
    else connections.setPendingEffortPick(connectionId, change.effortLevel);
    if (persisted) {
      const { settings, overrides, unreadable } = await readMergedClaudeSettings(workingDirOf(connections, sessionId));
      connections.broadcastToAll(MessageType.CLAUDE_SETTINGS_CHANGED, { settings, overrides, unreadable });
    }
  }

  // A chat that has sent nothing yet has no CLI; the first message spawns one with the pick as its flag.
  const via = sessionId ? await applyEffortToLiveCli(connections, sessionId, change) : 'not_running';

  connections.sendTo(connectionId, MessageType.ACK, {
    requestId: message.requestId,
    status: 'ok',
    via,
    persisted,
  });
}
