import type {LoadedMessageDto} from '@/types';

/**
 * The plan text for an `ExitPlanMode` call whose own `input` came back empty.
 *
 * The CLI fills `ExitPlanMode.input.plan` from the plan file when it handles the
 * call. When the model sends the plan file `Write` and `ExitPlanMode` in the same
 * turn, the file does not exist yet at that point, the recorded input stays `{}`,
 * and the card has nothing to draw (#467). The text is still in the transcript as
 * the `Write` that created the file, so read it from there.
 *
 * Returns the `content` of the latest `Write` to a `plans` directory at or before
 * the `ExitPlanMode` with this id, or undefined when there is none.
 */
export function findPlanFileContent(messages: LoadedMessageDto[], exitPlanToolUseId: string): string | undefined {
    let latest: string | undefined;

    for (const message of messages) {
        const content = message.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
            if (block.type !== 'tool_use') continue;
            const toolUse = block as unknown as {id?: string; name?: string; input?: Record<string, unknown>};

            if (toolUse.name === 'ExitPlanMode' && toolUse.id === exitPlanToolUseId) return latest;

            if (toolUse.name === 'Write' && isPlanFile(toolUse.input?.file_path) && typeof toolUse.input?.content === 'string') {
                latest = toolUse.input.content;
            }
        }
    }

    return undefined;
}

function isPlanFile(path: unknown): boolean {
    return typeof path === 'string' && /[\\/]plans[\\/][^\\/]+\.md$/.test(path);
}
