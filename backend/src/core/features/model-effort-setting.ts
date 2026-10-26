/**
 * The effort level a user picks for one model, stored where the CLI itself reads it:
 * `modelSettings.<model>.effortLevel` in the Claude settings file (#604).
 *
 * Why per model. The slider used to write one top-level `effortLevel` and every spawn passed it as
 * `--effort`, which outranks `modelSettings` (measured on CLI 2.1.310: Sonnet with
 * `modelSettings.claude-sonnet-5-5.effortLevel = low` ran at `low`, and the same process spawned with
 * `--effort high` ran at `high`). So a user who had set a level per model, `opusplan` included, lost all of
 * them the first time the slider moved. The CLI documents `modelSettings.<model>.effortLevel` as the
 * persisted per-model level, so the pick goes there and a fresh CLI reads it with no flag at all.
 *
 * What stays out of the file: `max`. The settings schema takes `low`, `medium`, `high` and `xhigh`, and
 * silently drops anything else on read, so a stored `max` would look saved and do nothing. A `max` pick
 * lasts for the session it was made in, the way the CLI's own `/effort max` does.
 */
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { getClaudeConfigDir } from './claudeConfigDir';
import { readJsonForUpdate, updateJsonFile } from './atomic-json';

/** The levels the settings file can hold for a model. */
const PERSISTABLE_LEVELS = new Set(['low', 'medium', 'high', 'xhigh']);

/** A model id as the settings file names it: the canonical name, no `[1m]` suffix and no date. */
const CANONICAL_MODEL = /^[a-z0-9][a-z0-9._-]{2,63}$/;

export function isPersistableEffortLevel(level: string): boolean {
  return PERSISTABLE_LEVELS.has(level);
}

/**
 * The canonical spelling of a model id, or null when the id is not a concrete model (an alias such as
 * `opus` or `opusplan` names no key the CLI would look up).
 *
 * The CLI keys the entry by canonical model name and also matches its dated, `[1m]`, Bedrock and Vertex
 * spellings against it, so the entry is written under the shortest spelling.
 */
export function canonicalModelName(model: string | null | undefined): string | null {
  if (typeof model !== 'string') return null;
  const bare = model.trim().replace(/\[[^\]]*\]$/, '').replace(/-\d{8}$/, '');
  if (!bare.startsWith('claude-') || !CANONICAL_MODEL.test(bare)) return null;
  return bare;
}

const settingsFile = () => join(getClaudeConfigDir(), 'settings.json');
const settingsLocalFile = () => join(getClaudeConfigDir(), 'settings.local.json');

export type SaveModelEffortResult =
  | { status: 'ok'; persisted: boolean }
  | { status: 'error'; error: string };

/**
 * Store [level] as [model]'s effort level, or remove the entry when [level] is null (the slider's Auto).
 *
 * Writes into whichever of `settings.local.json` and `settings.json` already holds `modelSettings`, with
 * `.local` first, so the value lands in the file whose copy would win the merge. Every other key of the
 * file, and every other key of this model's entry (`maxEffortLevel`, `autoCompactWindow`), is kept. Removing
 * clears the key from both files, so a leftover in the other one cannot keep answering.
 */
export async function saveModelEffortLevel(
  model: string | null | undefined,
  level: string | null,
): Promise<SaveModelEffortResult> {
  const name = canonicalModelName(model);
  if (!name) return { status: 'ok', persisted: false };
  if (level !== null && !isPersistableEffortLevel(level)) return { status: 'ok', persisted: false };

  try {
    await mkdir(getClaudeConfigDir(), { recursive: true });
    const files = [settingsLocalFile(), settingsFile()];

    if (level === null) {
      for (const file of files) {
        const result = await updateJsonFile(file, (current) => {
          const all = asRecord(current.modelSettings);
          const entry = all && asRecord(all[name]);
          if (!all || !entry || !('effortLevel' in entry)) return null;
          delete entry.effortLevel;
          if (Object.keys(entry).length === 0) delete all[name];
          if (Object.keys(all).length === 0) delete current.modelSettings;
          return current;
        });
        if (result.status === 'error') return { status: 'error', error: result.error };
      }
      return { status: 'ok', persisted: true };
    }

    // Which file owns `modelSettings`: the one a read of `.local` says has it, else the base file. An
    // unreadable `.local` is an error, not "has nothing", or the value would go to the base file while the
    // stale `.local` copy kept winning (the same rule saveKeyIntoOwningFile follows).
    const local = await readJsonForUpdate(settingsLocalFile());
    if (local.status === 'unreadable') {
      return { status: 'error', error: `${settingsLocalFile()} exists but could not be read (${local.reason})` };
    }
    const target = asRecord(local.data.modelSettings) ? settingsLocalFile() : settingsFile();
    const result = await updateJsonFile(target, (current) => {
      const all = asRecord(current.modelSettings) ?? {};
      const entry = asRecord(all[name]) ?? {};
      entry.effortLevel = level;
      all[name] = entry;
      current.modelSettings = all;
      return current;
    });
    return result.status === 'ok' ? { status: 'ok', persisted: true } : { status: 'error', error: result.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[node-backend]', 'Failed to save the model effort level:', err);
    return { status: 'error', error: msg };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
