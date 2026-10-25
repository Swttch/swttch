import type {LoadedMessageDto} from "@/types";
import {getBridge} from "@/api/bridge/Bridge";
import {MessageType} from "@/shared";

/** One file the CLI's `SendUserFile` tool put in front of the user. */
export interface SentFile {
    path: string;
    name: string;
    /** Extension without the dot, upper case, as the card's badge shows it. */
    badge: string;
    size?: number;
    /** The CLI's own verdict: true only for the pictures it draws as a picture (png, jpg, gif). */
    isImage: boolean;
    isVideo: boolean;
}

export interface SentFiles {
    files: SentFile[];
    /** `render` asks for a single picture at full width; anything else is the thumbnail form. */
    display?: string;
}

interface Attachment {
    path?: string;
    size?: number;
    isImage?: boolean;
    media_type?: string | null;
}

function baseName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

function extensionOf(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(dot + 1) : '';
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm']);

/**
 * The files of a `SendUserFile` call. The result's `attachments` carry what the
 * CLI found out (size, whether it is a picture); the call's own `files` are the
 * fallback for a call still running, which has no result yet.
 */
export function sentFilesOf(input: unknown, toolResult?: LoadedMessageDto): SentFiles {
    const result = toolResult?.toolUseResult as {attachments?: Attachment[]; display?: string} | undefined;
    const call = input as {files?: unknown; display?: string} | undefined;

    const attachments = Array.isArray(result?.attachments) ? result.attachments : [];
    const paths = attachments.length > 0
        ? attachments.map((a) => a.path ?? '')
        : Array.isArray(call?.files) ? (call.files as unknown[]).filter((f): f is string => typeof f === 'string') : [];

    const files = paths.filter(Boolean).map((path, index): SentFile => {
        const attachment = attachments[index];
        const name = baseName(path);
        const extension = extensionOf(name).toLowerCase();
        const mediaType = attachment?.media_type ?? '';
        return {
            path,
            name,
            badge: extension.toUpperCase(),
            size: attachment?.size,
            isImage: attachment ? attachment.isImage === true : ['png', 'jpg', 'jpeg', 'gif'].includes(extension),
            isVideo: mediaType.startsWith('video/') || VIDEO_EXTENSIONS.has(extension),
        };
    });

    return {files, display: result?.display ?? call?.display};
}

/** `217BYTE`, `4.6KB`: the size the way Claude Desktop writes it on a file card. */
export function formatSentSize(size: number): string {
    if (size < 1024) return `${size}BYTE`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
    return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

interface BackendMedia {
    kind?: string;
    mimeType?: string;
    base64?: string;
}

const cache = new Map<string, Promise<string | null>>();

/**
 * A `src` the page can play or draw for the picture or video at `path`, or null
 * when the backend cannot supply one (too big, gone, not a media file). Never rejects.
 */
export function loadSentMedia(path: string): Promise<string | null> {
    const known = cache.get(path);
    if (known) return known;

    const pending = (async (): Promise<string | null> => {
        const answer = (await getBridge().request(MessageType.GET_FILE_PREVIEW, {path})) as BackendMedia | undefined;
        if (!answer?.base64 || !answer.mimeType) return null;
        const dataUrl = `data:${answer.mimeType};base64,${answer.base64}`;
        if (answer.kind === 'image') return dataUrl;
        if (answer.kind === 'video') {
            // A data URL this size would be copied into the element; a blob is not.
            return URL.createObjectURL(await (await fetch(dataUrl)).blob());
        }
        return null;
    })().catch(() => {
        cache.delete(path);
        return null;
    });

    cache.set(path, pending);
    return pending;
}

/** @internal test-only. */
export function _resetSentMediaCache(): void {
    cache.clear();
}
