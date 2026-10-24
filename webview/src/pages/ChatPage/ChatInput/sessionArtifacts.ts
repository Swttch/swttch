import type {LoadedMessageDto} from "@/types";
import {ContentBlockType, type TextBlockDto, type ToolResultBlockDto} from "@/dto/message/ContentBlockDto";
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

/** A tool_result's content is a string or a list of content blocks; only the text of it counts here. */
function resultText(block: ToolResultBlockDto): string {
    const content = block.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
        .map((part) => (part.type === ContentBlockType.Text ? (part as TextBlockDto).text : ''))
        .join('');
}

/** The first block of a merged tool_result message, which is the shape the renderers are handed. */
function mergedResultBlock(merged: LoadedMessageDto | undefined): ToolResultBlockDto | undefined {
    const content = merged?.message?.content;
    if (!Array.isArray(content)) return undefined;
    const block = content[0];
    return block?.type === ContentBlockType.ToolResult ? (block as ToolResultBlockDto) : undefined;
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
 *
 * The result is found by the call's id among the user messages, not through the
 * `tool_result` the chat page folds into the call before drawing it. The
 * messages in the stream context are the ones before that fold, and a pill that
 * waited for it would never see a result.
 */
export function collectSessionArtifacts(messages: readonly LoadedMessageDto[]): SessionArtifact[] {
    const results = new Map<string, ToolResultBlockDto>();
    for (const message of messages) {
        const content = message.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
            if (block.type === ContentBlockType.ToolResult) {
                const result = block as ToolResultBlockDto;
                results.set(result.tool_use_id, result);
            }
        }
    }

    const found = new Map<string, SessionArtifact>();

    for (const message of messages) {
        const content = message.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
            if (block.type !== ContentBlockType.ToolUse || block.name !== 'Artifact') continue;
            const result = mergedResultBlock(block.tool_result) ?? results.get(block.id);
            if (!result || result.is_error === true) continue;

            const input = block.input ?? {};
            const action = input['action'];
            if (action !== undefined && action !== 'publish') continue;

            const calledUrl = typeof input['url'] === 'string' ? artifactUrlFrom(input['url']) : undefined;
            const url = artifactUrlFrom(resultText(result)) ?? calledUrl;
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
