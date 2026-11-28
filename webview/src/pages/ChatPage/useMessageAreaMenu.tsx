import {useCallback, useState, type MouseEvent} from "react";
import {ArrowDownTrayIcon, DocumentDuplicateIcon} from "@heroicons/react/24/outline";
import {MenuPanel, MenuRow, PointMenu, type MenuPoint} from "@/components/PointMenu";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {useSessionContext} from "@/contexts/SessionContext";
import {useTranslation} from "@/i18n";
import {downloadFrontendLogs} from "@/utils/downloadFrontendLogs";
import {ENTRY_UUID_ATTRIBUTE} from "./useScrollAnchor";

/** What has a right-click menu of its own worth keeping: "copy link address", "save image", "paste". */
const KEEPS_ITS_OWN_MENU = 'a[href], img, video, input, textarea, [contenteditable]:not([contenteditable="false"])';

interface OpenMenu {
    point: MenuPoint;
    entryUuid: string | null;
    hasSelection: boolean;
}

/**
 * The message area's right-click menu: "Copy" for the selected text, and the front log of this tab as a file, noting
 * which message the menu was opened on (#714). Put `onContextMenu` on the area and draw `menu` inside it.
 */
export function useMessageAreaMenu() {
    const {t} = useTranslation('chat');
    const {messages} = useChatStreamContext();
    const {currentSessionId} = useSessionContext();
    const [open, setOpen] = useState<OpenMenu | null>(null);
    const close = useCallback(() => setOpen(null), []);

    const onContextMenu = useCallback((event: MouseEvent<HTMLElement>) => {
        // Something below already answered with a menu of its own (a sent file, a file link).
        if (event.defaultPrevented) return;
        // A long press by finger or pen is how a phone selects text: the browser's own menu is part of that.
        const {pointerType} = event.nativeEvent as Partial<PointerEvent>;
        if (pointerType === 'touch' || pointerType === 'pen') return;
        const target = event.target as Element;
        // A right click in a window drawn into <body> still bubbles here through React.
        if (!event.currentTarget.contains(target) || target.closest(KEEPS_ITS_OWN_MENU)) return;
        event.preventDefault();
        setOpen({
            point: {x: event.clientX, y: event.clientY},
            entryUuid: target.closest(`[${ENTRY_UUID_ATTRIBUTE}]`)?.getAttribute(ENTRY_UUID_ATTRIBUTE) ?? null,
            hasSelection: (window.getSelection()?.toString() ?? '') !== '',
        });
    }, []);

    const menu = open && (
        <PointMenu point={open.point} onClose={close}>
            <MenuPanel>
                <MenuRow
                    icon={DocumentDuplicateIcon}
                    disabled={!open.hasSelection}
                    onSelect={() => {
                        // The browser's own copy, so that what the page adds to a copy (formatting, the host's
                        // clipboard) happens as it does for the keyboard shortcut.
                        document.execCommand('copy');
                        close();
                    }}
                >
                    {t('transcriptMenu.copy')}
                </MenuRow>
                <MenuRow
                    icon={ArrowDownTrayIcon}
                    onSelect={() => {
                        close();
                        void downloadFrontendLogs({messages, sessionId: currentSessionId, entryUuid: open.entryUuid});
                    }}
                >
                    {t('transcriptMenu.downloadLog')}
                </MenuRow>
            </MenuPanel>
        </PointMenu>
    );

    return {onContextMenu, menu};
}
