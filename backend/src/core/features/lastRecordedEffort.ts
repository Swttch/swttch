import { join } from 'path';
import { getProjectSessionsPath } from './getProjectSessionsPath';
import { readTail } from './lastRecordedSend';

/**
 * The effort level the CLI recorded for the last model response in a session.
 *
 * `effort` and `perTurnEffort` are the CLI's own fields on its assistant entry and
 * are passed on exactly as written (CLAUDE.md, original-data preservation).
 */
export interface RecordedEffort {
  /** The CLI's own id for the entry. Telling two reads apart is what keeps a stale one from being reported twice. */
  uuid: string;
  effort: string | null;
  perTurnEffort: string | null;
}

/**
 * What effort the last model response really ran at, from the transcript.
 *
 * The live stdout events do not say: measured on CLI 2.1.291, no `assistant` or
 * `result` event carries an effort field, and `system/init` carries only
 * `per_turn_effort_active`. The transcript's assistant entries do carry it, one per
 * response, and it matched the level in force for every turn of a session whose
 * level was changed between turns.
 *
 * Reads the tail, as readLastRecordedSend does, because the entry was written moments
 * ago. Null when the tail holds no such entry, or the file is not there: the caller
 * reports nothing, and the slider keeps showing the level the user chose.
 */
export async function readLastRecordedEffort(
  sessionId: string,
  workingDir: string,
): Promise<RecordedEffort | null> {
  try {
    const sessionsDir = await getProjectSessionsPath(workingDir);
    const text = await readTail(join(sessionsDir, `${sessionId}.jsonl`));
    const lines = text.split('\n');

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.trim()) continue;
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        // The first line of a mid-file tail is usually a partial entry; a line we cannot read tells us nothing.
        continue;
      }
      if (entry.type !== 'assistant' || typeof entry.uuid !== 'string') continue;
      const effort = typeof entry.effort === 'string' ? entry.effort : null;
      const perTurnEffort = typeof entry.perTurnEffort === 'string' ? entry.perTurnEffort : null;
      // An assistant entry written by a CLI that predates the field says nothing; keep looking is wrong
      // too (an older entry's level is not this response's), so stop at the newest assistant entry.
      if (effort === null && perTurnEffort === null) return null;
      return { uuid: entry.uuid, effort, perTurnEffort };
    }
    return null;
  } catch {
    return null;
  }
}
