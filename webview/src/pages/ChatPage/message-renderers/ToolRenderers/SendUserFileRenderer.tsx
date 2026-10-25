import {useEffect, useState} from "react";
import toast from "react-hot-toast";
import {ArrowDownTrayIcon} from "@heroicons/react/24/outline";
import {SessionGalleryViewer} from "@/components/SessionGalleryViewer";
import {Tooltip} from "@/components/Tooltip";
import {i18n, useTranslation} from "@/i18n";
import {openChatFile} from "@/utils/openChatFile";
import {cn} from "@/utils/cn";
import {RendererProps, ToolWrapper, toolResultBlockIndex} from "./common";
import {downloadSentFile, formatSentSize, loadSentMedia, sentFilesOf, type SentFile} from "./sendUserFile";

/** The `src` of a sent picture, video or sound; null when it cannot be had, undefined while loading. */
function useSentMedia(path: string): string | null | undefined {
    const [src, setSrc] = useState<string | null | undefined>(undefined);
    useEffect(() => {
        let alive = true;
        loadSentMedia(path).then((value) => {
            if (alive) setSrc(value);
        });
        return () => {
            alive = false;
        };
    }, [path]);
    return src;
}

/**
 * The button that saves the file, fading in when the pointer is over what it
 * belongs to (the parent has to be `group relative`), as Claude Desktop's does.
 */
function DownloadButton({file, className}: {file: SentFile; className?: string}) {
    const {t} = useTranslation('chat');
    return (
        <button
            type="button"
            aria-label={t('sentFiles.download')}
            onClick={async (event) => {
                event.stopPropagation();
                if (!(await downloadSentFile(file.path, file.name))) toast.error(i18n.t('chat:sentFiles.downloadFailed'));
            }}
            className={cn(
                "absolute end-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-md bg-surface-overlay text-text-primary",
                "opacity-0 transition-opacity duration-200 hover:bg-surface-hover focus-visible:opacity-100 group-hover/sent:opacity-100",
                className,
            )}
        >
            <ArrowDownTrayIcon className="h-4 w-4"/>
        </button>
    );
}

/** Wraps an item so its full path shows on hover, and the download button has something to sit on. */
function Item({file, className, children}: {file: SentFile; className?: string; children: React.ReactNode}) {
    return (
        <Tooltip content={<span dir="ltr">{file.path}</span>} placement="bottom">
            <div className={cn("group/sent relative", className)}>
                {children}
                <DownloadButton file={file}/>
            </div>
        </Tooltip>
    );
}

/** A file as a card: its kind in the corner, its name (two lines at most) and size at the foot. */
function FileCard({file}: {file: SentFile}) {
    return (
        <Item file={file} className="h-[120px] w-[120px] shrink-0">
            <button
                type="button"
                onClick={() => openChatFile(file.path)}
                className="flex h-full w-full min-w-0 flex-col justify-between rounded-lg border border-border-default bg-surface-hover/40 p-2.5 text-left transition-colors hover:bg-surface-hover"
            >
                <span className="self-start rounded-full border border-border-default px-1.5 text-[0.625rem] leading-4 text-text-secondary">
                    {file.badge || 'FILE'}
                </span>
                <span className="min-w-0 w-full">
                    <span dir="auto" className="block break-words text-[0.8125rem] leading-4 text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">{file.name}</span>
                    {file.size !== undefined && (
                        <span className="block text-[0.6875rem] text-text-tertiary">{formatSentSize(file.size)}</span>
                    )}
                </span>
            </button>
        </Item>
    );
}

/** A file sent alone: one line, the kind, the name and the size. */
function FileChip({file}: {file: SentFile}) {
    return (
        <Item file={file} className="inline-flex max-w-full">
            <button
                type="button"
                onClick={() => openChatFile(file.path)}
                className="flex max-w-full items-center gap-2.5 rounded-xl border border-border-default bg-surface-hover/40 py-2.5 pe-11 ps-3 text-left transition-colors hover:bg-surface-hover"
            >
                <span className="shrink-0 rounded-full border border-border-default px-2 text-[0.6875rem] leading-4 text-text-secondary">
                    {file.badge || 'FILE'}
                </span>
                <span dir="auto" className="truncate text-[1rem] leading-6 text-text-primary">{file.name}</span>
                {file.size !== undefined && <span className="shrink-0 text-[0.8125rem] text-text-tertiary">{formatSentSize(file.size)}</span>}
            </button>
        </Item>
    );
}

/** A picture: a 120px thumbnail inside its card, or the picture itself at its own size when it is sent alone. */
function Picture({file, alone, onOpen}: {file: SentFile; alone: boolean; onOpen: () => void}) {
    const src = useSentMedia(file.path);
    if (src === null) return alone ? <FileChip file={file}/> : <FileCard file={file}/>;
    if (src === undefined) {
        return <div className={cn("rounded-lg bg-surface-hover/40", alone ? "h-40 w-40" : "h-[120px] w-[120px]")}/>;
    }
    return (
        <Item file={file} className={alone ? "inline-flex max-w-full" : "h-[120px] w-[120px] shrink-0"}>
            <button
                type="button"
                onClick={onOpen}
                className="block max-w-full overflow-hidden rounded-lg border border-border-default bg-surface-hover/40"
            >
                <img
                    src={src}
                    alt={file.name}
                    // Claude Desktop letterboxes a thumbnail inside its card instead of cropping it.
                    className={alone ? "block max-w-full" : "block h-[120px] w-[120px] object-contain"}
                />
            </button>
        </Item>
    );
}

function Video({file, alone}: {file: SentFile; alone: boolean}) {
    const src = useSentMedia(file.path);
    const [broken, setBroken] = useState(false);
    if (src === null || broken) return alone ? <FileChip file={file}/> : <FileCard file={file}/>;
    if (src === undefined) return <div className="aspect-video w-full max-w-[320px] rounded-xl bg-surface-hover/40"/>;
    return (
        <video
            src={src}
            controls
            preload="metadata"
            onError={() => setBroken(true)}
            // 320px wide (two thirds of the 480px Claude Desktop uses), keeping the video's own ratio.
            className="block w-full max-w-[320px] rounded-xl"
        />
    );
}

/** A sound in a player with its name above it, as Claude Desktop draws it. */
function Audio({file, alone}: {file: SentFile; alone: boolean}) {
    const src = useSentMedia(file.path);
    if (src === null) return alone ? <FileChip file={file}/> : <FileCard file={file}/>;
    return (
        <div className="flex flex-col gap-1">
            <span dir="auto" className="text-[0.6875rem] text-text-tertiary">{file.name}</span>
            {src === undefined
                ? <div className="h-10 w-[320px] max-w-full rounded-full bg-surface-hover/40"/>
                : <audio src={src} controls preload="metadata" className="max-w-full"/>}
        </div>
    );
}

/**
 * The files the CLI's `SendUserFile` tool sent, drawn the way Claude Desktop
 * draws them in the transcript, kind by kind (by extension):
 *
 * - video (mp4, mov, webm) and sound (mp3, wav) in players, above everything else;
 * - everything left side by side in one block that wraps where the line ends:
 *   pictures (png, jpg, gif, webp, bmp, avif) as thumbnails, other files as cards;
 * - a call that sends exactly one file draws it alone: a picture at its own size,
 *   anything else as a one-line chip.
 *
 * Whatever the file is, the pointer over it shows its full path and a download button.
 */
export function SendUserFileRenderer(props: RendererProps) {
    const {files} = sentFilesOf(props.toolUse.input, props.toolResult);
    const [opened, setOpened] = useState<number | null>(null);

    const players = files.filter((f) => f.kind === 'video' || f.kind === 'audio');
    const rest = files.filter((f) => f.kind !== 'video' && f.kind !== 'audio');
    const pictures = files.filter((f) => f.isImage);
    const alone = files.length === 1;

    // Where each sent picture sits in the session, so the viewer can step on to the others.
    const blockIndex = toolResultBlockIndex(props.toolResult, props.toolUse.id);
    const entryUuid = props.toolResult?.uuid;
    const pictureKeys = entryUuid && blockIndex >= 0 ? pictures.map((file) => `${entryUuid}:${blockIndex}:f${files.indexOf(file)}`) : undefined;

    return (
        <ToolWrapper message={props.message}>
            <div className="flex flex-col items-start gap-2">
                {players.map((file) => (file.kind === 'video' ? <Video key={file.path} file={file} alone={alone}/> : <Audio key={file.path} file={file} alone={alone}/>))}
                {rest.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {rest.map((file) => {
                            if (file.isImage) {
                                return <Picture key={file.path} file={file} alone={alone} onOpen={() => setOpened(pictures.indexOf(file))}/>;
                            }
                            return alone ? <FileChip key={file.path} file={file}/> : <FileCard key={file.path} file={file}/>;
                        })}
                    </div>
                )}
                {opened !== null && <PictureViewer pictures={pictures} keys={pictureKeys} entryUuid={entryUuid} index={opened} onClose={() => setOpened(null)}/>}
            </div>
        </ToolWrapper>
    );
}

/**
 * The viewer for the pictures of one `SendUserFile` call. A sponsor steps from
 * here across every picture of the session; the sent pictures are read first, so
 * the viewer opens on the right one without a round trip.
 */
function PictureViewer({pictures, keys, entryUuid, index, onClose}: {
    pictures: SentFile[];
    keys: string[] | undefined;
    entryUuid: string | undefined;
    index: number;
    onClose: () => void;
}) {
    const [srcs, setSrcs] = useState<string[] | null>(null);
    useEffect(() => {
        let alive = true;
        Promise.all(pictures.map((file) => loadSentMedia(file.path))).then((loaded) => {
            if (alive) setSrcs(loaded.map((src) => src ?? ''));
        });
        return () => {
            alive = false;
        };
    }, [pictures]);
    if (srcs === null) return null;
    return <SessionGalleryViewer entryUuid={entryUuid} localSrcs={srcs} localKeys={keys} openedIndex={index} onClose={onClose}/>;
}
