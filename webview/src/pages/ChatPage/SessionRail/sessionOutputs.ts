import type {LoadedMessageDto} from "@/types";
import {ContentBlockType, ImageBlockDto, ToolResultBlockDto} from "@/dto/message/ContentBlockDto";
import {collectSessionArtifacts} from "../ChatInput/sessionArtifacts";
import {sentFilesOf} from "../message-renderers/ToolRenderers/sendUserFile";

/** One line of the session rail's outputs list. */
export type SessionOutput =
    | {kind: 'file'; key: string; path: string; name: string; badge: string; isImage: boolean; time?: string}
    | {kind: 'image'; key: string; src: string; tool: string; time?: string}
    | {kind: 'artifact'; key: string; url: string; title: string};

/**
 * The name a picture row gives its maker: the server of an MCP tool (`mcp__Claude_Browser__computer`
 * reads `Claude Browser`), the tool's own name otherwise.
 */
export function toolLabel(name: string): string {
    const parts = name.split('__');
    const server = parts[0] === 'mcp' && parts.length >= 3 ? parts[1] : name;
    return server.replace(/[_-]+/g, ' ').trim() || name;
}

/** The `data:` URLs of the picture blocks a tool result carries. */
function imagesOf(result: ToolResultBlockDto): string[] {
    if (!Array.isArray(result.content)) return [];
    const urls: string[] = [];
    for (const part of result.content) {
        if (part.type !== ContentBlockType.Image) continue;
        const source = (part as ImageBlockDto).source;
        if (source?.type === 'base64' && source.data && source.media_type) {
            urls.push(`data:${source.media_type};base64,${source.data}`);
        }
    }
    return urls;
}

/**
 * What the session has made for the reader, newest first: the files the CLI's
 * `SendUserFile` sent, the pictures tools returned (a screenshot, a read image)
 * and the Artifacts published. Claude Desktop's session rail lists the same
 * three kinds under "Outputs".
 *
 * Read from the messages the chat already holds, so a session loaded from history
 * lists what an earlier run made. A tool call that failed or has no result yet
 * contributes nothing.
 */
export function collectSessionOutputs(messages: readonly LoadedMessageDto[]): SessionOutput[] {
    const resultOf = new Map<string, {block: ToolResultBlockDto; message: LoadedMessageDto}>();
    for (const message of messages) {
        const content = message.message?.content;
        if (!Array.isArray(content)) continue;
        for (const block of content) {
            if (block.type === ContentBlockType.ToolResult) {
                resultOf.set((block as ToolResultBlockDto).tool_use_id, {block: block as ToolResultBlockDto, message});
            }
        }
    }

    const outputs: SessionOutput[] = [];
    for (const message of messages) {
        const content = message.message?.content;
        if (!Array.isArray(content)) continue;

        for (const block of content) {
            if (block.type !== ContentBlockType.ToolUse) continue;
            const result = resultOf.get(block.id);
            if (!result || result.block.is_error === true) continue;
            const time = result.message.timestamp;

            if (block.name === 'SendUserFile') {
                const {files} = sentFilesOf(block.input, result.message);
                files.forEach((file, index) => {
                    outputs.push({kind: 'file', key: `${block.id}:${index}`, path: file.path, name: file.name, badge: file.badge, isImage: file.isImage, time});
                });
                continue;
            }

            imagesOf(result.block).forEach((src, index) => {
                outputs.push({kind: 'image', key: `${block.id}:${index}`, src, tool: block.name, time});
            });
        }
    }

    // Published pages lead the list (they are few and the thing the reader came for),
    // then files and pictures by recency: the list is reversed below, so pushing the
    // pages last puts them first.
    for (const artifact of collectSessionArtifacts(messages)) {
        outputs.push({kind: 'artifact', key: artifact.url, url: artifact.url, title: artifact.title});
    }

    return outputs.reverse();
}
