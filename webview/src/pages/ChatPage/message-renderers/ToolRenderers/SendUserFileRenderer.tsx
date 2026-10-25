import {useEffect, useState} from "react";
import {SessionGalleryViewer} from "@/components/SessionGalleryViewer";
import {openChatFile} from "@/utils/openChatFile";
import {cn} from "@/utils/cn";
import {RendererProps, ToolWrapper, toolResultBlockIndex} from "./common";
import {formatSentSize, loadSentMedia, sentFilesOf, type SentFile} from "./sendUserFile";

/** The `src` of a sent picture or video, null while loading or when it cannot be had. */
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

/** A file as a card: its kind in the corner, its name and size at the foot. */
function FileCard({file}: {file: SentFile}) {
    return (
        <button
            type="button"
            title={file.name}
            onClick={() => openChatFile(file.path)}
            className="flex h-[120px] w-[120px] shrink-0 flex-col justify-between rounded-lg border border-border-default bg-surface-hover/40 p-2.5 text-left hover:bg-surface-hover transition-colors"
        >
            <span className="self-start rounded-full border border-border-default px-1.5 text-[0.625rem] leading-4 text-text-secondary">
                {file.badge || 'FILE'}
            </span>
            <span className="min-w-0">
                <span dir="ltr" className="block truncate text-text-primary text-[0.8125rem]">{file.name}</span>
                {file.size !== undefined && (
                    <span className="block text-[0.6875rem] text-text-tertiary">{formatSentSize(file.size)}</span>
                )}
            </span>
        </button>
    );
}

/** A picture: a 120px thumbnail that opens the viewer, or the whole picture when `large`. */
function Picture({file, large, onOpen}: {file: SentFile; large: boolean; onOpen: () => void}) {
    const src = useSentMedia(file.path);
    if (src === null) return <FileCard file={file}/>;
    if (src === undefined) {
        return <div className={cn("rounded-lg bg-surface-hover/40", large ? "h-40 w-full" : "h-[120px] w-[120px]")}/>;
    }
    return (
        <button type="button" onClick={onOpen} className="block max-w-full overflow-hidden rounded-lg border border-border-default bg-surface-hover/40">
            <img
                src={src}
                alt={file.name}
                // Desktop letterboxes a thumbnail inside its card instead of cropping it.
                className={large ? "block max-w-full" : "block h-[120px] w-[120px] object-contain"}
            />
        </button>
    );
}

function Video({file}: {file: SentFile}) {
    const src = useSentMedia(file.path);
    const [broken, setBroken] = useState(false);
    if (src === null || broken) return <FileCard file={file}/>;
    if (src === undefined) return <div className="h-[160px] w-[320px] max-w-full rounded-lg bg-surface-hover/40"/>;
    return (
        <video
            src={src}
            controls
            preload="metadata"
            onError={() => setBroken(true)}
            className="block max-w-[320px] rounded-lg"
        />
    );
}

/**
 * The files the CLI's `SendUserFile` tool sent, drawn the way Claude Desktop draws
 * them in the transcript: videos as a player, pictures as thumbnails that open a
 * viewer (one picture sent with `display: render` is drawn whole), everything else
 * as a grid of cards.
 */
export function SendUserFileRenderer(props: RendererProps) {
    const {files, display} = sentFilesOf(props.toolUse.input, props.toolResult);
    const [opened, setOpened] = useState<number | null>(null);

    const videos = files.filter((f) => f.isVideo);
    const pictures = files.filter((f) => f.isImage && !f.isVideo);
    const large = display === 'render' && pictures.length === 1;
    // Where each sent picture sits in the session, so the viewer can step on to the others.
    const blockIndex = toolResultBlockIndex(props.toolResult, props.toolUse.id);
    const entryUuid = props.toolResult?.uuid;
    const pictureKeys = entryUuid && blockIndex >= 0 ? pictures.map((file) => `${entryUuid}:${blockIndex}:f${files.indexOf(file)}`) : undefined;

    return (
        <ToolWrapper message={props.message}>
            <div className="flex flex-col gap-2">
                {videos.map((file) => <Video key={file.path} file={file}/>)}
                {/* One grid in the order the files were sent, as Desktop draws it: a picture and a card sit side by side. */}
                {files.some((f) => !f.isVideo) && (
                    <div className={large ? "flex flex-col gap-2" : "flex max-w-[376px] flex-wrap gap-2"}>
                        {files.filter((f) => !f.isVideo).map((file) => (
                            file.isImage
                                ? <Picture key={file.path} file={file} large={large} onOpen={() => setOpened(pictures.indexOf(file))}/>
                                : <FileCard key={file.path} file={file}/>
                        ))}
                    </div>
                )}
                {opened !== null && <PictureViewer pictures={pictures} keys={pictureKeys} entryUuid={props.toolResult?.uuid} index={opened} onClose={() => setOpened(null)}/>}
            </div>
        </ToolWrapper>
    );
}

/**
 * The viewer for the pictures of one `SendUserFile` call. A sponsor steps from
 * here across every picture of the session; the sent pictures are read from disk
 * first, so the viewer opens on the right one without a round trip.
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
