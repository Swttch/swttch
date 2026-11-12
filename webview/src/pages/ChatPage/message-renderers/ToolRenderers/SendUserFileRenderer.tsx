import {useEffect, useState} from "react";
import {ArrowDownTrayIcon} from "@heroicons/react/24/outline";
import {SessionGalleryViewer} from "@/components/SessionGalleryViewer";
import {Tooltip} from "@/components/Tooltip";
import {useTranslation} from "@/i18n";
import {openSentFile} from "@/utils/openChatFile";
import {cn} from "@/utils/cn";
import {RendererProps, ToolWrapper, toolResultBlockIndex} from "./common";
import {SentFileContextMenu, SentFileMoreButton, type MenuPoint} from "./SentFileMenu";
import {useSentFileProgress} from "./sentFileProgress";
import {pickModeOf, SentFileSelectionProvider, useSentFileSelection} from "./sentFileSelection";
import {downloadSentFileTargets, formatSentSize, loadSentMedia, sentFilesOf, type SentFile} from "./sendUserFile";

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
 * The buttons on a file, fading in when the pointer is over what they belong to (the parent has to be
 * `group relative`), as Claude Desktop's download button does: the download button, and beside it the one that opens
 * the file's menu. They stay while that menu is open, since the pointer has moved onto the menu by then.
 */
function ItemActions({file, className}: {file: SentFile; className?: string}) {
    const {t} = useTranslation('chat');
    const [menuOpen, setMenuOpen] = useState(false);
    // On a file that is in a pick of several, both buttons act on the whole pick.
    const files = useSentFileSelection().targetsFor(file);
    return (
        <div
            data-sent-actions
            className={cn(
                "absolute end-1.5 top-1.5 z-10 flex items-center gap-1",
                "opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/sent:opacity-100",
                menuOpen && "opacity-100",
                className,
            )}
        >
            <button
                type="button"
                aria-label={files.length > 1 ? t('sentFiles.downloadMany', {count: files.length}) : t('sentFiles.download')}
                onClick={async (event) => {
                    event.stopPropagation();
                    await downloadSentFileTargets(files);
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-overlay text-text-primary hover:bg-surface-hover"
            >
                <ArrowDownTrayIcon className="h-4 w-4"/>
            </button>
            <SentFileMoreButton files={files} onOpenChange={setMenuOpen}/>
        </div>
    );
}

/**
 * The card's background, filled from the start edge as far as the file has been written while it is being saved. It
 * is drawn over the card without catching the pointer, in the card's own corner radius.
 */
function SaveProgress({path, radius}: {path: string; radius: string}) {
    const fraction = useSentFileProgress(path);
    if (fraction === null) return null;
    const percent = Math.round(fraction * 100);
    return (
        <span
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className={cn("pointer-events-none absolute inset-0 overflow-hidden", radius)}
        >
            <span className="block h-full bg-ide-accent opacity-20 transition-[width] duration-150 ease-out" style={{width: `${percent}%`}}/>
        </span>
    );
}

/**
 * Wraps an item so its full path shows on hover, and the buttons have something to sit on. It is also where a file is
 * picked: Shift+click and Cmd+click (Ctrl+click on Windows and Linux) pick it instead of opening it, a picked file is ringed, and a right click opens
 * the file's menu (the pick's, when the file is in a pick of several).
 */
function Item({file, className, downloadClassName, radius = "rounded-lg", children}: {file: SentFile; className?: string; downloadClassName?: string; radius?: string; children: React.ReactNode}) {
    const [menu, setMenu] = useState<{point: MenuPoint; files: SentFile[]} | null>(null);
    const selection = useSentFileSelection();
    const picked = selection.selected.has(file.path);
    return (
        <Tooltip content={<span dir="ltr">{file.path}</span>} placement="bottom">
            <div
                data-sent-file
                data-picked={picked ? "" : undefined}
                className={cn("group/sent relative", className)}
                // A press with Shift held must not start a text selection that the click then extends.
                onMouseDown={(event) => {
                    if (event.shiftKey) event.preventDefault();
                }}
                // Before the card's own button sees the click: with Shift or Cmd it picks the file and opens nothing; any other
                // click lets go of the pick and goes on to open the file as usual. The buttons on the card are left alone,
                // and so is a menu: it is drawn into <body>, but its clicks still travel up through this card in React.
                onClickCapture={(event) => {
                    if ((event.target as HTMLElement).closest("[data-sent-actions], [role=menu]")) return;
                    const mode = pickModeOf(event);
                    if (mode === null) {
                        selection.clear();
                        return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    selection.pick(file, mode);
                }}
                // The file's menu where the pointer is, the same one the more button opens. A file outside the pick is not
                // part of it, so the pick is let go of first.
                onContextMenu={(event) => {
                    event.preventDefault();
                    if (!picked) selection.clear();
                    setMenu({point: {x: event.clientX, y: event.clientY}, files: selection.targetsFor(file)});
                }}
            >
                {children}
                <SaveProgress path={file.path} radius={radius}/>
                {picked && <span aria-hidden className={cn("pointer-events-none absolute inset-0 ring-2 ring-ide-accent", radius)}/>}
                <ItemActions file={file} className={downloadClassName}/>
                {menu && <SentFileContextMenu files={menu.files} point={menu.point} onClose={() => setMenu(null)}/>}
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
                onClick={() => openSentFile(file.path)}
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

/** A file as a chip: one line, the kind, the name and the size. */
function FileChip({file}: {file: SentFile}) {
    return (
        <Item file={file} className="inline-flex max-w-full" downloadClassName="end-2.5 top-1/2 -translate-y-1/2" radius="rounded-xl">
            <button
                type="button"
                onClick={() => openSentFile(file.path)}
                className="flex max-w-full items-center gap-2.5 rounded-xl border border-border-default bg-surface-hover/40 py-2.5 pe-3 ps-3 text-left transition-colors hover:bg-surface-hover"
            >
                <span className="shrink-0 rounded-full border border-border-default px-2 text-[0.6875rem] leading-4 text-text-secondary">
                    {file.badge || 'FILE'}
                </span>
                <span dir="auto" className="truncate text-[1rem] leading-6 text-text-primary">{file.name}</span>
                {/* The size sits at the chip's right end; on hover the download button takes its place. */}
                {file.size !== undefined && (
                    <span className="ms-auto shrink-0 ps-2 text-[0.8125rem] text-text-tertiary transition-opacity duration-200 group-hover/sent:opacity-0">
                        {formatSentSize(file.size)}
                    </span>
                )}
            </button>
        </Item>
    );
}

/**
 * A file that is not drawn as a picture or a player. Claude Desktop draws these as one-line chips, side by side, and
 * changes all of them into square cards as soon as a picture is among the files, so that they line up with the picture's
 * thumbnail. A file sent alone is always the chip.
 */
function FileBox({file, card}: {file: SentFile; card: boolean}) {
    return card ? <FileCard file={file}/> : <FileChip file={file}/>;
}

/** A picture: a 120px thumbnail inside its card, or the picture itself at its own size when it is sent alone. */
function Picture({file, alone, card, onOpen}: {file: SentFile; alone: boolean; card: boolean; onOpen: () => void}) {
    const src = useSentMedia(file.path);
    if (src === null) return <FileBox file={file} card={card}/>;
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

function Video({file, card}: {file: SentFile; card: boolean}) {
    const src = useSentMedia(file.path);
    const [broken, setBroken] = useState(false);
    if (src === null || broken) return <FileBox file={file} card={card}/>;
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
function Audio({file, card}: {file: SentFile; card: boolean}) {
    const src = useSentMedia(file.path);
    if (src === null) return <FileBox file={file} card={card}/>;
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
 *   pictures (png, jpg, gif, webp, bmp, avif) as thumbnails, other files as one-line chips, or as square cards
 *   when a picture is among them;
 * - a call that sends exactly one file draws it alone: a picture at its own size,
 *   anything else as a one-line chip.
 *
 * Whatever the file is, the pointer over it shows its full path and a download button.
 */
export function SendUserFileRenderer(props: RendererProps) {
    const {t} = useTranslation('chat');
    const {files} = sentFilesOf(props.toolUse.input, props.toolResult);
    const [opened, setOpened] = useState<number | null>(null);

    const players = files.filter((f) => f.kind === 'video' || f.kind === 'audio');
    const rest = files.filter((f) => f.kind !== 'video' && f.kind !== 'audio');
    const pictures = files.filter((f) => f.isImage);
    const alone = files.length === 1;
    // The files that are not pictures or players become cards when a picture is among the files, and are chips otherwise.
    const asCards = !alone && pictures.length > 0;

    // Where each sent picture sits in the session, so the viewer can step on to the others.
    const blockIndex = toolResultBlockIndex(props.toolResult, props.toolUse.id);
    const entryUuid = props.toolResult?.uuid;
    const pictureKeys = entryUuid && blockIndex >= 0 ? pictures.map((file) => `${entryUuid}:${blockIndex}:f${files.indexOf(file)}`) : undefined;

    // Until the CLI answers there is nothing to draw but what Claude Desktop says while it works.
    if (!props.toolResult) {
        return (
            <ToolWrapper message={props.message}>
                <span className="text-text-secondary">{t('sentFiles.sharing')}</span>
            </ToolWrapper>
        );
    }

    return (
        <ToolWrapper message={props.message}>
            <div className="flex flex-col items-start gap-2">
                {players.map((file) => (file.kind === 'video' ? <Video key={file.path} file={file} card={asCards}/> : <Audio key={file.path} file={file} card={asCards}/>))}
                {rest.length > 0 && (
                    <SentFileSelectionProvider files={rest}>
                        <div className="flex flex-wrap gap-2">
                            {rest.map((file) => {
                                if (file.isImage) {
                                    return <Picture key={file.path} file={file} alone={alone} card={asCards} onOpen={() => setOpened(pictures.indexOf(file))}/>;
                                }
                                return <FileBox key={file.path} file={file} card={asCards}/>;
                            })}
                        </div>
                    </SentFileSelectionProvider>
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
