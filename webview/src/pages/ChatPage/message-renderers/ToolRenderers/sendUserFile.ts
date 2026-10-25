import type {LoadedMessageDto} from "@/types";
import {getBridge} from "@/api/bridge/Bridge";
import {MessageType, sentFileExtension, sentFileKind, type SentFileKind} from "@/shared";
import {loadFileContent} from "@/components/FilePreviewPane/loadFileContent";

/** One file the CLI's `SendUserFile` tool put in front of the user. */
export interface SentFile {
    path: string;
    name: string;
    /** Extension without the dot, upper case, as the card's badge shows it. */
    badge: string;
    size?: number;
    /** How it is drawn: a player, a thumbnail, or a card (decided by extension, as Claude Desktop does). */
    kind: SentFileKind;
    /** A picture the viewer can step through. */
    isImage: boolean;
}

export interface SentFiles {
    files: SentFile[];
    /** The call's own `display` value; Claude Desktop draws a lone picture whole whichever it is, so it is only passed on. */
    display?: string;
}

interface Attachment {
    path?: string;
    size?: number;
}

function baseName(path: string): string {
    return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The files of a `SendUserFile` call. The result's `attachments` carry what the
 * CLI found out (the size); the call's own `files` are the fallback for a call
 * still running, which has no result yet.
 */
export function sentFilesOf(input: unknown, toolResult?: LoadedMessageDto): SentFiles {
    const result = toolResult?.toolUseResult as {attachments?: Attachment[]; display?: string} | undefined;
    const call = input as {files?: unknown; display?: string} | undefined;

    const attachments = Array.isArray(result?.attachments) ? result.attachments : [];
    const paths = attachments.length > 0
        ? attachments.map((a) => a.path ?? '')
        : Array.isArray(call?.files) ? (call.files as unknown[]).filter((f): f is string => typeof f === 'string') : [];

    const files = paths.filter(Boolean).map((path, index): SentFile => {
        const name = baseName(path);
        const kind = sentFileKind(name);
        return {
            path,
            name,
            badge: sentFileExtension(name).toUpperCase(),
            size: attachments[index]?.size,
            kind,
            isImage: kind === 'picture',
        };
    });

    return {files, display: result?.display ?? call?.display};
}

/** `217BYTE`, `9.2KB`, `41.3MB`: the size the way Claude Desktop writes it, in units of 1000. */
export function formatSentSize(size: number): string {
    if (size < 1000) return `${size}BYTE`;
    if (size < 1_000_000) return `${(size / 1000).toFixed(1)}KB`;
    return `${(size / 1_000_000).toFixed(1)}MB`;
}

interface BackendMedia {
    kind?: string;
    mimeType?: string;
    base64?: string;
}

const cache = new Map<string, Promise<string | null>>();

/**
 * A `src` the page can play or draw for the picture, video or sound at `path`, or
 * null when the backend cannot supply one (larger than Claude Desktop uploads,
 * gone, not media). Never rejects.
 */
export function loadSentMedia(path: string): Promise<string | null> {
    const known = cache.get(path);
    if (known) return known;

    const pending = (async (): Promise<string | null> => {
        // A video is read in pieces like the preview pane reads one, so a large one (Claude Desktop
        // plays a 40MB video in the chat) does not have to cross the connection as a single message.
        if (sentFileKind(path) === 'video') {
            const loaded = await loadFileContent(path);
            return loaded.ok && loaded.kind === 'video' ? URL.createObjectURL(loaded.blob) : null;
        }
        const answer = (await getBridge().request(MessageType.GET_FILE_PREVIEW, {path, sentFile: true})) as BackendMedia | undefined;
        if (!answer?.base64 || !answer.mimeType) return null;
        const dataUrl = `data:${answer.mimeType};base64,${answer.base64}`;
        if (answer.kind === 'image') return dataUrl;
        if (answer.kind === 'video' || answer.kind === 'audio') {
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

interface BackendBytes {
    ok?: boolean;
    size?: number;
    base64?: string;
}

function base64ToBytes(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Save the file at `path` to disk, under `name`: read in pieces through the
 * backend, then handed to the browser as a download (the way the viewer saves a
 * picture). Resolves false when the file could not be read.
 */
export async function downloadSentFile(path: string, name: string): Promise<boolean> {
    const pieces: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const answer = (await getBridge().request(MessageType.GET_FILE_BYTES, {path, offset: loaded})) as BackendBytes | undefined;
        if (!answer?.ok || answer.size === undefined || answer.base64 === undefined) return false;
        const bytes = base64ToBytes(answer.base64);
        pieces.push(bytes);
        loaded += bytes.length;
        if (loaded >= answer.size || bytes.length === 0) break;
    }

    const objectUrl = URL.createObjectURL(new Blob(pieces as BlobPart[]));
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on a timer: revoking while the browser is still reading the blob cancels the save.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    return true;
}

/** @internal test-only. */
export function _resetSentMediaCache(): void {
    cache.clear();
}
