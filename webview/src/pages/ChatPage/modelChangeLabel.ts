import { toDisplayLabel } from '@/types/models';
import { ModelInfo } from '@/types/slashCommand';

/**
 * The model name written on the chat's model-change line.
 *
 * That line answers "what did I just pick?", and for every row but one the
 * answer is the row's own name. The `default` row is the exception: picking it
 * is a choice to follow whatever the default is, so naming only the model
 * behind it drops the very thing that was chosen, while naming only the row
 * leaves the reader guessing which model that is. The line says both.
 *
 * The "(recommended)" half of that row's name is a nudge for while you are
 * choosing, not something worth keeping once you have chosen, so a trailing
 * parenthesis goes. The word before it comes from the CLI's own `displayName`
 * rather than from a "Default" we write here, so a catalog that calls the row
 * something else keeps its own wording.
 *
 * A default row the CLI did not resolve (an older CLI omits the field) has no
 * model to name, so it keeps its name whole.
 *
 * Lives here rather than on `ModelInfo` because it is a rule about this one
 * line on screen, not a fact about a catalog row — and two components produce
 * that line (the rotate shortcut in `ModelTag` and the picker in
 * `ModelSwitchOverlay`), so it must not be written twice.
 */
export function modelChangeLabel(info: ModelInfo): string {
  if (!info.isDefaultRow || !info.resolvedModel) return info.label;
  const running = toDisplayLabel(info.resolvedModel);
  const choice = info.displayName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return choice ? `${choice} · ${running}` : running;
}
