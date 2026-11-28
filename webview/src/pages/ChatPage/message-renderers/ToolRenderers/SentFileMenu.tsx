import {useRef, useState} from "react";
import Tippy from "@tippyjs/react/headless";
import type {Instance} from "tippy.js";
import toast from "react-hot-toast";
import {ArrowDownTrayIcon, DocumentDuplicateIcon, EllipsisHorizontalIcon, FolderOpenIcon, LinkIcon, PaperClipIcon} from "@heroicons/react/24/outline";
import {getAdapter} from "@/adapters";
import {useTranslation} from "@/i18n";
import {addFileToComposer} from "@/utils/composerElements";
import {cn} from "@/utils/cn";
import {MenuPanel, MenuRow as Row, PointMenu, type MenuPoint} from "@/components/PointMenu";
import {downloadSentFileTargets} from "./sendUserFile";

/** A file a menu acts on: where it is and what it is called. */
export interface SentFileTarget {
    path: string;
    name: string;
    size?: number;
}

/** Copies text and says whether it worked: a clipboard write can fail, and a silent failure leaves the wrong thing pasted later. */
function copy(text: string, done: string, failed: string): void {
    navigator.clipboard.writeText(text).then(
        () => toast.success(done),
        () => toast.error(failed),
    );
}

/**
 * What can be done with the files a menu stands for: one file, or the pick of several. The same list is drawn by the
 * card's "more" button and by the context menu, so the two cannot drift apart.
 *
 * For several files the entries that make sense for a run of them stay, named for their number, under a heading that says
 * how many: showing a file in the file manager is for one file, since the files may be in different folders.
 */
export function SentFileMenuItems({files, onDone}: {files: SentFileTarget[]; onDone: () => void}) {
    const {t} = useTranslation('chat');
    const run = (action: () => void | Promise<unknown>) => () => {
        onDone();
        void action();
    };
    const count = files.length;
    const [file] = files;
    return (
        <MenuPanel>
            {count > 1 && (
                <div className="px-3 pb-1 pt-1.5 text-[0.6875rem] text-text-tertiary">{t('sentFiles.selectedHeading', {count})}</div>
            )}
            <Row icon={ArrowDownTrayIcon} onSelect={run(() => downloadSentFileTargets(files))}>
                {count > 1 ? t('sentFiles.downloadMany', {count}) : t('sentFiles.download')}
            </Row>
            {count === 1 && (
                <Row icon={FolderOpenIcon} onSelect={run(() =>
                    getAdapter().revealFile(file.path).catch(() => toast.error(t('fileOpenFailed', {path: file.path}))),
                )}>{t('fileLink.showInFileManager')}</Row>
            )}
            <Row icon={PaperClipIcon} onSelect={run(() => files.forEach((target) => addFileToComposer(target.path, target.name, target.size)))}>
                {count > 1 ? t('sentFiles.attachMany', {count}) : t('sentFiles.attach')}
            </Row>
            <Row icon={DocumentDuplicateIcon} onSelect={run(() =>
                count > 1
                    ? copy(files.map((target) => target.name).join('\n'), t('sentFiles.namesCopiedMany', {count}), t('sentFiles.copyNameFailed'))
                    : copy(file.name, t('sentFiles.nameCopied'), t('sentFiles.copyNameFailed')),
            )}>{count > 1 ? t('sentFiles.copyNamesMany', {count}) : t('sentFiles.copyName')}</Row>
            <Row icon={LinkIcon} onSelect={run(() =>
                count > 1
                    ? copy(files.map((target) => target.path).join('\n'), t('sentFiles.pathsCopiedMany', {count}), t('fileLink.copyFailed'))
                    : copy(file.path, t('fileLink.copyDone'), t('fileLink.copyFailed')),
            )}>{count > 1 ? t('sentFiles.copyPathsMany', {count}) : t('fileLink.copyPath')}</Row>
        </MenuPanel>
    );
}

export type {MenuPoint};

/**
 * The file's menu opened where the pointer was when the card was right-clicked. It is the same list as the more
 * button's, drawn at a different place, and closes on a click outside it, on Escape, and when an entry is chosen.
 */
export function SentFileContextMenu({files, point, onClose}: {files: SentFileTarget[]; point: MenuPoint; onClose: () => void}) {
    return (
        <PointMenu point={point} onClose={onClose}>
            <SentFileMenuItems files={files} onDone={onClose}/>
        </PointMenu>
    );
}

/**
 * The button beside the download button that opens the file's menu. The menu opens as soon as the pointer is over the
 * button, and stays while the pointer is on it, so the actions are one move away; a click or the keyboard opens it too.
 *
 * `onOpenChange` lets the card keep its buttons showing while the menu is open, since the pointer has left the card by
 * then.
 */
export function SentFileMoreButton({files, onOpenChange}: {files: SentFileTarget[]; onOpenChange?: (open: boolean) => void}) {
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
                    <SentFileMenuItems files={files} onDone={() => instance.current?.hide()}/>
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
