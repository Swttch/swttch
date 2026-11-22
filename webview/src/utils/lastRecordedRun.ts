import { LoadedMessageType } from '@/dto/common';
import type { LoadedMessageDto } from '@/types';

/**
 * What the CLI wrote on the newest model response of a session: the model that answered and the effort level it ran
 * at. Both are the CLI's own fields on its `assistant` entry, passed on as written (original-data preservation).
 */
export interface LastRecordedRun {
  model: string | null;
  effort: string | null;
}

// The model the CLI names on an entry it made up itself (an API error shown as a reply), which no model answered.
const SYNTHETIC_MODEL = '<synthetic>';

/**
 * Read, from the page of a session that was just opened, which model answered last and at what effort.
 *
 * A session that is opened has no running CLI, so the screen has nothing that says what the session was using until
 * the CLI starts again on the next send. Until then the model tag showed the saved default instead (a session left
 * on Opus showed the default's name after coming back to it) and the effort slider showed nothing. The transcript
 * does say: each response is written as an `assistant` entry with the `model` that answered and the `effort` it ran
 * at.
 *
 * The newest real response decides. Entries a subagent wrote (`isSidechain`) and entries the CLI made up for an
 * error (`<synthetic>`) are not the session's own answer, so they are passed over. A field is null when the entry
 * does not carry it (a CLI that predates `effort`), in which case the caller keeps whatever the screen already shows.
 */
export function findLastRecordedRun(messages: ReadonlyArray<LoadedMessageDto>): LastRecordedRun {
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    if (entry.type !== LoadedMessageType.Assistant || entry.isSidechain) continue;
    const model = entry.message?.model;
    if (typeof model !== 'string' || model === '' || model === SYNTHETIC_MODEL) continue;
    return {
      model,
      effort: typeof entry.effort === 'string' ? entry.effort : null,
    };
  }
  return { model: null, effort: null };
}
