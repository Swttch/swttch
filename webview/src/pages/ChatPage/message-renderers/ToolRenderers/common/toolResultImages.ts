import type {LoadedMessageDto} from "@/types";
import {ContentBlockType, ImageBlockDto, ToolResultBlockDto} from "@/dto/message/ContentBlockDto";

/**
 * The pictures a tool result carries, as `data:` URLs the page can draw. The CLI
 * puts a picture it read (`Read` of a png, jpg, gif or webp) in the result as an
 * `image` block next to, or instead of, the text. Never throws.
 */
export function toolResultImages(toolResult?: LoadedMessageDto): string[] {
    const content = toolResult?.message?.content;
    if (!Array.isArray(content)) return [];
    const block = content[0];
    if (!block || block.type !== ContentBlockType.ToolResult) return [];
    const inner = (block as ToolResultBlockDto).content;
    if (!Array.isArray(inner)) return [];

    const urls: string[] = [];
    for (const part of inner) {
        if (part.type !== ContentBlockType.Image) continue;
        const source = (part as ImageBlockDto).source;
        if (source?.type === 'base64' && source.data && source.media_type) {
            urls.push(`data:${source.media_type};base64,${source.data}`);
        } else if (source?.type === 'url' && source.data) {
            urls.push(source.data);
        }
    }
    return urls;
}

/** Where the tool result of `toolUseId` sits among its entry's content blocks, or -1. */
export function toolResultBlockIndex(toolResult: LoadedMessageDto | undefined, toolUseId: string | undefined): number {
    const content = toolResult?.message?.content;
    if (!Array.isArray(content)) return -1;
    const exact = toolUseId === undefined ? -1 : content.findIndex((b) => b.type === ContentBlockType.ToolResult && (b as ToolResultBlockDto).tool_use_id === toolUseId);
    return exact >= 0 ? exact : content.findIndex((b) => b.type === ContentBlockType.ToolResult);
}

/**
 * The session-wide key of each picture this tool result carries, in the order of
 * {@link toolResultImages}, or undefined when the entry has no uuid yet (a turn
 * still streaming): the viewer then stays inside the result.
 */
export function toolResultPictureKeys(toolResult: LoadedMessageDto | undefined, toolUseId: string | undefined): string[] | undefined {
    const uuid = toolResult?.uuid;
    const blockIndex = toolResultBlockIndex(toolResult, toolUseId);
    if (!uuid || blockIndex < 0) return undefined;
    const inner = (toolResult?.message?.content?.[blockIndex] as ToolResultBlockDto | undefined)?.content;
    if (!Array.isArray(inner)) return undefined;
    const keys: string[] = [];
    inner.forEach((part, partIndex) => {
        if (part.type !== ContentBlockType.Image) return;
        const source = (part as ImageBlockDto).source;
        if ((source?.type === 'base64' && source.data && source.media_type) || (source?.type === 'url' && source.data)) {
            keys.push(`${uuid}:${blockIndex}:${partIndex}`);
        }
    });
    return keys;
}
