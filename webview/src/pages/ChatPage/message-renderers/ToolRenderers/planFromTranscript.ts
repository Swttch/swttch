import type {LoadedMessageDto} from '@/types';

type ToolUseLike = {id?: string; name?: string; input?: Record<string, unknown>};

/**
 * The plan text for an `ExitPlanMode` call whose own `input` came back empty.
 *
 * The CLI fills `ExitPlanMode.input.plan` from the plan file when it handles the
 * call. When the model sends the plan file `Write` and `ExitPlanMode` in the same
 * turn, the file does not exist yet at that point, the recorded input stays `{}`,
 * and the card has nothing to draw (#467). The text is still in the transcript as
 * the `Write` that created the file, so rebuild it from there: the latest plan
 * file `Write` before the `ExitPlanMode`, with the `Edit`s made to it since.
 *
 * Which `Write` is the plan file:
 * - one sent in the same response as the `ExitPlanMode` (plan mode only lets the
 *   model write the plan file, and `plansDirectory` can put it in any folder), or
 * - one under a `.claude/plans/` folder, for a plan written in an earlier response.
 * A project document under some other `plans/` folder is not mistaken for it.
 *
 * Returns undefined when there is no such `Write`, or when an `Edit` cannot be
 * applied to what was reconstructed. A missing plan is better than a wrong one.
 */
export function findPlanFileContent(messages: LoadedMessageDto[], exitPlanToolUseId: string): string | undefined {
    const exit = locateExitPlanMode(messages, exitPlanToolUseId);
    if (!exit) return undefined;

    let planPath: string | undefined;
    let planText: string | undefined;
    let broken = false;

    for (let i = 0; i <= exit.index; i++) {
        const message = messages[i];
        const sameResponseAsExit = i === exit.index || (!!exit.responseId && responseIdOf(message) === exit.responseId);

        for (const toolUse of toolUsesOf(message)) {
            if (toolUse.name === 'ExitPlanMode' && toolUse.id === exitPlanToolUseId) {
                return broken ? undefined : planText;
            }

            const input = toolUse.input ?? {};
            const filePath = typeof input.file_path === 'string' ? input.file_path : undefined;
            if (!filePath) continue;

            if (toolUse.name === 'Write' && typeof input.content === 'string') {
                if (isPlanFileInEarlierResponse(filePath) || (sameResponseAsExit && filePath.endsWith('.md'))) {
                    planPath = filePath;
                    planText = input.content;
                    broken = false;
                }
            } else if (filePath === planPath && planText !== undefined) {
                const edited = applyEdits(planText, toolUse);
                if (edited === undefined) broken = true;
                else planText = edited;
            }
        }
    }

    return undefined;
}

function toolUsesOf(message: LoadedMessageDto): ToolUseLike[] {
    const content = message.message?.content;
    if (!Array.isArray(content)) return [];
    return content.filter(block => block.type === 'tool_use') as unknown as ToolUseLike[];
}

/** The API response an entry came from: the loaded JSONL keeps it on `message.id`, a live entry on `message_id`. */
function responseIdOf(message: LoadedMessageDto): string | undefined {
    return message.message?.id || message.message_id || undefined;
}

function locateExitPlanMode(messages: LoadedMessageDto[], toolUseId: string): {index: number; responseId?: string} | undefined {
    for (let i = 0; i < messages.length; i++) {
        if (toolUsesOf(messages[i]).some(t => t.name === 'ExitPlanMode' && t.id === toolUseId)) {
            return {index: i, responseId: responseIdOf(messages[i])};
        }
    }
    return undefined;
}

function isPlanFileInEarlierResponse(path: string): boolean {
    return /[\\/]\.claude[\\/]plans[\\/][^\\/]+\.md$/.test(path);
}

/** The text after an `Edit` or `MultiEdit` of the plan file; undefined if it does not apply. */
function applyEdits(text: string, toolUse: ToolUseLike): string | undefined {
    const input = toolUse.input ?? {};
    const edits = toolUse.name === 'Edit' ? [input]
        : toolUse.name === 'MultiEdit' && Array.isArray(input.edits) ? input.edits as Array<Record<string, unknown>>
        : undefined;
    if (!edits) return text;

    let result = text;
    for (const edit of edits) {
        if (typeof edit.old_string !== 'string' || typeof edit.new_string !== 'string' || edit.old_string === '') return undefined;
        if (!result.includes(edit.old_string)) return undefined;
        result = edit.replace_all
            ? result.split(edit.old_string).join(edit.new_string)
            : result.replace(edit.old_string, () => edit.new_string as string);
    }
    return result;
}
