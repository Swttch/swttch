import {useRef, useState, type ComponentType, type ReactNode, type SVGProps} from "react";
import Tippy from "@tippyjs/react/headless";
import type {Instance} from "tippy.js";
import toast from "react-hot-toast";
import {ArrowDownTrayIcon, DocumentDuplicateIcon, EllipsisHorizontalIcon, FolderOpenIcon, LinkIcon, PaperClipIcon} from "@heroicons/react/24/outline";
import {getAdapter} from "@/adapters";
import {i18n, useTranslation} from "@/i18n";
import {addFileToComposer} from "@/utils/composerElements";
import {cn} from "@/utils/cn";
import {downloadSentFile} from "./sendUserFile";

/** A file a menu acts on: where it is and what it is called. */
export interface SentFileTarget {
    path: string;
    name: string;
    size?: number;
}

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const rowClass = "flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-text-primary transition-colors hover:bg-surface-hover cursor-pointer";

function Row({icon: Glyph, onSelect, children}: {icon: Icon; onSelect: () => void; children: ReactNode}) {
    return (
        <button type="button" role="menuitem" onClick={onSelect} className={rowClass}>
            <Glyph className="h-4 w-4 shrink-0 text-text-secondary"/>
            <span className="min-w-0 truncate">{children}</span>
        </button>
    );
}

/** Copies text and says whether it worked: a clipboard write can fail, and a silent failure leaves the wrong thing pasted later. */
function copy(text: string, done: string, failed: string): void {
    navigator.clipboard.writeText(text).then(
        () => toast.success(done),
        () => toast.error(failed),
    );
}

/**
 * What can be done with a file Claude sent. The same list is drawn by the card's "more" button and, later, by the
 * context menu, so the two cannot drift apart.
 */
export function SentFileMenuItems({file, onDone}: {file: SentFileTarget; onDone: () => void}) {
    const {t} = useTranslation('chat');
    const run = (action: () => void | Promise<unknown>) => () => {
        onDone();
        void action();
    };
    return (
        <div
            role="menu"
            className="w-max min-w-[12rem] max-w-[18rem] overflow-hidden rounded-md border border-border-default bg-surface-raised py-1 shadow-xl"
            // The menu is drawn into <body>, but a click still bubbles to the React tree it belongs to, where the card's
            // ancestors act on clicks (opening the file, logging the entry). Opening a menu asked for neither.
            onClick={(event) => event.stopPropagation()}
        >
            <Row icon={ArrowDownTrayIcon} onSelect={run(async () => {
                if (!(await downloadSentFile(file.path, file.name))) toast.error(i18n.t('chat:sentFiles.downloadFailed'));
            })}>{t('sentFiles.download')}</Row>
            <Row icon={FolderOpenIcon} onSelect={run(() =>
                getAdapter().revealFile(file.path).catch(() => toast.error(t('fileOpenFailed', {path: file.path}))),
            )}>{t('fileLink.showInFileManager')}</Row>
            <Row icon={PaperClipIcon} onSelect={run(() => addFileToComposer(file.path, file.name, file.size))}>
                {t('sentFiles.attach')}
            </Row>
            <Row icon={DocumentDuplicateIcon} onSelect={run(() =>
                copy(file.name,t('sentFiles.nameCopied'), t('sentFiles.copyNameFailed')),
            )}>{t('sentFiles.copyName')}</Row>
            <Row icon={LinkIcon} onSelect={run(() =>
                copy(file.path, t('fileLink.copyDone'), t('fileLink.copyFailed')),
            )}>{t('fileLink.copyPath')}</Row>
        </div>
    );
}

/**
 * The button beside the download button that opens the file's menu. The menu opens as soon as the pointer is over the
 * button, and stays while the pointer is on it, so the actions are one move away; a click or the keyboard opens it too.
 *
 * `onOpenChange` lets the card keep its buttons showing while the menu is open, since the pointer has left the card by
 * then.
 */
export function SentFileMoreButton({file, onOpenChange}: {file: SentFileTarget; onOpenChange?: (open: boolean) => void}) {
    const {t} = useTranslation('chat');
    const instance = useRef<Instance | null>(null);
    const [open, setOpen] = useState(false);
    const change = (next: boolean) => {
        setOpen(next);
        onOpenChange?.(next);
    };
    return (
        <Tippy
            interactive
            trigger="mouseenter focus"
            delay={[80, 150]}
            placement="bottom-end"
            offset={[0, 4]}
            // Out of the chat's scroll container, so the menu is never clipped by it.
            appendTo={() => document.body}
            onCreate={(created) => { instance.current = created; }}
            onShow={() => change(true)}
            onHide={() => change(false)}
            render={(attrs) => (
                <div {...attrs}>
                    <SentFileMenuItems file={file} onDone={() => instance.current?.hide()}/>
                </div>
            )}
        >
            <button
                type="button"
                aria-label={t('sentFiles.more')}
                aria-haspopup="menu"
                aria-expanded={open}
                onClick={(event) => {
                    event.stopPropagation();
                    instance.current?.show();
                }}
                className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md bg-surface-overlay text-text-primary hover:bg-surface-hover",
                    open && "bg-surface-hover",
                )}
            >
                <EllipsisHorizontalIcon className="h-4 w-4"/>
            </button>
        </Tippy>
    );
}
