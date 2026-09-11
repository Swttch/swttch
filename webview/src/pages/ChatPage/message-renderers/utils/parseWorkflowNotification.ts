import { parseXmlTag, parseXmlTags } from '@/utils/parseXmlTag';
import type { WorkflowNotification } from '@/dto/message/ContentBlockDto';
import type { WorkflowUsage } from '@/shared';

const NOTIFICATION_TAG = '<task-notification>';

/** Cheap check before the heavier parse. */
export function hasWorkflowNotification(text: string): boolean {
    return text.includes(NOTIFICATION_TAG);
}

function toInt(value: string | undefined): number | undefined {
    if (value === undefined) return undefined;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse a `<task-notification>` envelope into a {@link WorkflowNotification}.
 * Returns null when the text carries no notification. The `<usage>` sub-block is
 * parsed from its own slice so the inner numeric tags don't collide with any
 * same-named tags elsewhere in the message.
 */
/** Tags read into named fields above, so they are not repeated in `notification`. */
const NAMED_TAGS = ['task-id', 'tool-use-id', 'output-file', 'status', 'summary', 'result', 'usage'];

export function parseWorkflowNotification(text: string): WorkflowNotification | null {
    if (!hasWorkflowNotification(text)) return null;

    // Under the envelope's own tag names, not renamed on the way in. The
    // envelope calls the token total `subagent_tokens` where the live events
    // call it `total_tokens`; that difference is the CLI's to make.
    const usage: WorkflowUsage = {};
    for (const [tag, value] of Object.entries(parseXmlTags(parseXmlTag(text, 'usage') ?? ''))) {
        usage[tag] = toInt(value) ?? value;
    }

    // Scanned from inside the envelope, so the envelope's own tag does not
    // come back as one of its contents.
    const rest = parseXmlTags(parseXmlTag(text, 'task-notification') ?? '');
    for (const named of NAMED_TAGS) delete rest[named];

    return {
        taskId: parseXmlTag(text, 'task-id'),
        toolUseId: parseXmlTag(text, 'tool-use-id'),
        outputFile: parseXmlTag(text, 'output-file'),
        status: parseXmlTag(text, 'status'),
        summary: parseXmlTag(text, 'summary'),
        result: parseXmlTag(text, 'result'),
        usage: Object.keys(usage).length > 0 ? usage : undefined,
        notification: Object.keys(rest).length > 0 ? rest : undefined,
    };
}
