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
