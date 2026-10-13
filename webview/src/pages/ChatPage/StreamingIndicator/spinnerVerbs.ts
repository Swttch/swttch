import { SpinnerVerbsMode, type SpinnerVerbsConfig } from '@/types/claude-settings';

/**
 * The verbs the spinner rotates through, given the built-in set and the user's
 * `spinnerVerbs` setting (#548).
 *
 * Follows Claude Code's documented contract: `append` adds to the built-in set,
 * `replace` shows only the user's verbs, and `replace` with nothing usable keeps the
 * built-in set. Any `mode` other than `replace` is read as `append`, as the Cursor
 * extension does. A hand-edited file can hold any shape, so `verbs` that is not an
 * array reads as the key being absent rather than as an error: a spinner must never be
 * what breaks a turn.
 */
export function resolveSpinnerVerbs(
    builtIn: readonly string[],
    setting: SpinnerVerbsConfig | null | undefined,
): readonly string[] {
    if (!setting || !Array.isArray(setting.verbs)) return builtIn;

    const userVerbs = setting.verbs.filter((verb): verb is string => typeof verb === 'string');

    if (setting.mode === SpinnerVerbsMode.Replace) {
        return userVerbs.length > 0 ? userVerbs : builtIn;
    }
    return [...builtIn, ...userVerbs];
}
