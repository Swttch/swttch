import type {LoadedMessageDto} from "@/types";
import {ContentBlockType} from "@/dto/message/ContentBlockDto";
import {toolResultIsError, toolResultRawText} from "../message-renderers/ToolRenderers/common/toolStatus";
import {artifactUrlFrom} from "../message-renderers/ToolRenderers/ArtifactRenderer";
import {basename} from "./basename";

export interface SessionArtifact {
    /** The page's address on claude.ai. */
    url: string;
    /** The name the call gave the page, or an empty string when none of its calls named it. */
    title: string;
}

/** `hello.html` -> `hello`: a published file stands in for a title the call never gave. */
function titleFromFile(filePath: unknown): string {
    if (typeof filePath !== 'string' || filePath.length === 0) return '';
    return basename(filePath).replace(/\.[^.]+$/, '');
}

/**
 * The Artifacts this session has published, oldest touch first, so the last
 * entry is the one the terminal's `Ctrl+]` reopens: the most recent.
 *
 * Read from the messages the chat already holds rather than kept as state of
 * its own, so a session loaded from history shows the same Artifacts as the
 * one that just published them. A page counts when an `Artifact` call that
 * publishes (no `action`, or `publish`) came back without an error and its
 * result names the page. `quickstart`, `list`, `read` and the data and comment
 * tools name pages too, but do not publish one, so they are left out. A page
 * published again is moved to the end and keeps the first title any call gave it.
 */
export function collectSessionArtifacts(messages: readonly LoadedMessageDto[]): SessionArtifact[] {
    const found = new Map<string, SessionArtifact>();

    for (const message of messages) {
        const content = message.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
            if (block.type !== ContentBlockType.ToolUse || block.name !== 'Artifact') continue;
            const toolResult = block.tool_result;
            if (!toolResult || toolResultIsError(toolResult)) continue;

            const input = block.input ?? {};
            const action = input['action'];
            if (action !== undefined && action !== 'publish') continue;

            const calledUrl = typeof input['url'] === 'string' ? artifactUrlFrom(input['url']) : undefined;
            const url = artifactUrlFrom(toolResultRawText(toolResult)) ?? calledUrl;
            if (url === undefined) continue;

            const title = (typeof input['title'] === 'string' ? input['title'] : '')
                || titleFromFile(input['file_path'])
                || found.get(url)?.title
                || '';
            found.delete(url);
            found.set(url, {url, title});
        }
    }

    return [...found.values()];
}
