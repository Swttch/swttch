import type {LoadedMessageDto} from "@/types";
import toast from "react-hot-toast";
import {getBridge} from "@/api/bridge/Bridge";
import {i18n} from "@/i18n";
import {FINISHED_BAR_MS, setSentFileProgress} from "./sentFileProgress";
import {showSavedToast} from "./sentFileToast";
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
    // An answer of "nothing to show" is only true right now (the file may be written or restored
    // later), so it is not kept: the next time the card mounts it asks again.
    void pending.then((value) => {
        if (value === null && cache.get(path) === pending) cache.delete(path);
    });
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
 * Save the file at `path` to disk, under `name`, and say so: the host's own save
 * dialog asks where (the IDE's in JetBrains mode, the platform's in standalone),
 * the backend copies the file there, and a toast names the place it went.
 * Closing the dialog saves nothing and says nothing. Resolves false when the
 * file could not be read, which is for the caller to report.
 *
 * Only when the host cannot ask at all (an older IDE plugin that does not know
 * the request) does the file go through the browser's own download instead,
 * which saves it where the browser keeps downloads, so the toast then says only
 * that it was downloaded.
 */
export async function downloadSentFile(path: string, name: string): Promise<boolean> {
    const progress = trackSaveProgress([path]);
    const report = (fraction: number) => progress.report(path, fraction);
    try {
        try {
            const answer = (await getBridge().request(MessageType.SAVE_SENT_FILE, {path, suggestedName: name}, {timeout: null})) as {path?: string | null; error?: string} | null;
            if (answer?.path) {
                showSavedToast(i18n.t('chat:sentFiles.saved', {path: answer.path}));
                return true;
            }
            if (answer && answer.path === null && !answer.error) return true; // They closed the dialog.
            if (answer?.error === 'unreadable' || answer?.error === 'tooLarge') return false;
        } catch {
            // The host could not ask; the browser's own download is next.
        }
        const downloaded = await downloadThroughBrowser(path, name, report);
        if (downloaded) showSavedToast(i18n.t('chat:sentFiles.downloaded', {name}));
        return downloaded;
    } finally {
        progress.finish();
    }
}

/**
 * What the cards of `paths` fill their backgrounds with while those files are saved: `report` sets a card's fraction
 * itself, and what the backend sends while it copies is taken in until `finish`, which leaves each bar that was drawn
 * full for a moment (so a file that took no time is still seen to have been saved) and then takes it away.
 */
function trackSaveProgress(paths: string[]) {
    const shown = new Set<string>();
    const report = (path: string, fraction: number) => {
        shown.add(path);
        setSentFileProgress(path, fraction);
    };
    const stopListening = getBridge().subscribe(MessageType.SAVE_SENT_FILE_PROGRESS, (message) => {
        const progress = message.payload as {path?: string; loaded?: number; size?: number} | undefined;
        if (progress?.path !== undefined && paths.includes(progress.path) && progress.loaded !== undefined && progress.size) {
            report(progress.path, progress.loaded / progress.size);
        }
    });
    return {
        report,
        finish() {
            stopListening();
            for (const path of shown) {
                setSentFileProgress(path, 1);
                setTimeout(() => setSentFileProgress(path, null), FINISHED_BAR_MS);
            }
        },
    };
}

/** A file to save: where it is and the name it is saved under. */
export interface SentFileToSave {
    path: string;
    name: string;
}

/**
 * Save several files into one folder, and say so. The host's folder dialog asks where (closing it saves nothing and
 * says nothing), the backend copies each file there under its own name (a name already taken gets a number, nothing is
 * written over), each card fills its background as its own file is written, and a toast names the folder.
 */
export async function downloadSentFiles(files: SentFileToSave[]): Promise<void> {
    const picked = (await getBridge().request(MessageType.PICK_FILES, {mode: 'folders', multiple: false}, {timeout: null})) as {paths?: string[]; error?: string} | null;
    const folder = picked?.paths?.[0];
    if (!folder) {
        if (picked?.error) toast.error(i18n.t('chat:sentFiles.downloadFailed'));
        return;
    }
    const progress = trackSaveProgress(files.map((file) => file.path));
    try {
        // Only what the backend needs: a card's own object carries more than a path and a name.
        const wanted = files.map(({path, name}) => ({path, name}));
        const answer = (await getBridge().request(MessageType.SAVE_SENT_FILES, {files: wanted, folder}, {timeout: null})) as {saved?: unknown[]; failed?: string[]; error?: string} | null;
        if (!answer || answer.error) {
            toast.error(i18n.t('chat:sentFiles.downloadFailed'));
            return;
        }
        const saved = answer.saved?.length ?? 0;
        const failed = answer.failed?.length ?? 0;
        if (saved > 0) showSavedToast(i18n.t('chat:sentFiles.savedMany', {count: saved, folder}));
        if (failed > 0) toast.error(i18n.t('chat:sentFiles.saveFailedMany', {count: failed}));
    } finally {
        progress.finish();
    }
}

/** What the download button and the menu's download entry do with the files they stand for: one file or a pick of several. */
export async function downloadSentFileTargets(files: SentFileToSave[]): Promise<void> {
    if (files.length === 1) {
        if (!(await downloadSentFile(files[0].path, files[0].name))) toast.error(i18n.t('chat:sentFiles.downloadFailed'));
        return;
    }
    if (files.length > 1) await downloadSentFiles(files);
}

/** The file read in pieces through the backend, then handed to the browser as a download. */
async function downloadThroughBrowser(path: string, name: string, report: (fraction: number) => void): Promise<boolean> {
    const pieces: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const answer = (await getBridge().request(MessageType.GET_FILE_BYTES, {path, offset: loaded})) as BackendBytes | undefined;
        if (!answer?.ok || answer.size === undefined || answer.base64 === undefined) return false;
        const bytes = base64ToBytes(answer.base64);
        pieces.push(bytes);
        loaded += bytes.length;
        if (answer.size > 0) report(loaded / answer.size);
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
