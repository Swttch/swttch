import {useEffect, useMemo, useRef, useState} from "react";
import toast from "react-hot-toast";
import {getAdapter} from "@/adapters";
import {Tooltip} from "@/components/Tooltip";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {i18n, useTranslation} from "@/i18n";
import {Tag} from "./Tag";
import {collectSessionArtifacts} from "./sessionArtifacts";

function openArtifact(url: string) {
    getAdapter()
        .openUrl(url)
        .catch((err) => {
            console.error('[ArtifactTag] Failed to open Artifact:', err);
            toast.error(i18n.t('chat:externalLink.openFailed'));
        });
}

function PageIcon() {
    return (
        <svg className="w-[14px] h-[14px] shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 1.75h5.2L12.25 4.8V13.5a.75.75 0 0 1-.75.75h-7.5a.75.75 0 0 1-.75-.75v-11a.75.75 0 0 1 .75-.75Z"
                  stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M9 1.75V5h3.25" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
    );
}

/**
 * The composer's pill for the Artifacts this session has published, the one the
 * terminal shows under the prompt (#593): the page's name when there is one,
 * a count when there are several.
 *
 * Clicking opens the page in the browser, as the terminal's `o` does. With
 * several pages the click lists them, newest first, and picking one opens it.
 * `Ctrl+]` reopens the most recent one without the pointer, as in the terminal.
 * It is `Ctrl` on every platform, `Cmd` is not accepted on a Mac, because the
 * terminal's binding is `Ctrl+]` there too and the same keys should do the same.
 *
 * The list is read from the chat's own messages, so a session loaded from
 * history shows its Artifacts like one that just published them.
 */
export function ArtifactTag() {
    const {t} = useTranslation('chat');
    const {messages} = useChatStreamContext();
    const artifacts = useMemo(() => collectSessionArtifacts(messages), [messages]);
    const [listOpen, setListOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    const latest = artifacts[artifacts.length - 1];
    const latestUrl = latest?.url;

    useEffect(() => {
        if (latestUrl === undefined) return;
        const onKeyDown = (e: KeyboardEvent) => {
            // The physical key too: a layout that does not print "]" with Ctrl held still has it on BracketRight.
            // A Hangul input source on macOS turns Ctrl+] into another key altogether (measured: key "ㅁ", code
            // "KeyA"), which neither check can recover; the pill is the way in there.
            if ((e.key !== ']' && e.code !== 'BracketRight') || !e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.isComposing) return;
            e.preventDefault();
            e.stopPropagation();
            openArtifact(latestUrl);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [latestUrl]);

    useEffect(() => {
        if (!listOpen) return;
        const onPointerDown = (e: MouseEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setListOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setListOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [listOpen]);

    useEffect(() => {
        if (artifacts.length < 2) setListOpen(false);
    }, [artifacts.length]);

    if (latest === undefined) return null;

    const fallbackTitle = t('chatInput.artifacts.fallbackTitle');
    const single = artifacts.length === 1;
    const label = single ? (latest.title || fallbackTitle) : t('chatInput.artifacts.count', {total: artifacts.length});

    const onClick = () => {
        if (single) openArtifact(latest.url);
        else setListOpen((open) => !open);
    };

    return (
        <div ref={rootRef} className="relative flex items-center min-w-0 max-xs:hidden">
            {listOpen && (
                <div className="absolute bottom-full start-0 z-30 mb-2 min-w-[200px] max-w-[320px] rounded-md border
                                border-border-default bg-surface-overlay py-1 text-[0.8461rem] shadow-lg"
                     role="menu">
                    <p className="px-3 py-1 text-[0.7692rem] text-text-tertiary">{t('chatInput.artifacts.listTitle')}</p>
                    {[...artifacts].reverse().map((artifact) => (
                        <button
                            key={artifact.url}
                            type="button"
                            role="menuitem"
                            className="flex w-full items-center gap-2 px-3 py-1 text-start text-text-primary hover:bg-surface-hover"
                            onClick={() => {
                                setListOpen(false);
                                openArtifact(artifact.url);
                            }}
                        >
                            <PageIcon/>
                            <span className="truncate" dir="auto">{artifact.title || fallbackTitle}</span>
                        </button>
                    ))}
                </div>
            )}
            <Tooltip content={single ? t('chatInput.artifacts.openOne') : t('chatInput.artifacts.openLatest')}>
                <Tag onClick={onClick} className="max-w-[200px]">
                    <PageIcon/>
                    <span className="truncate" dir="auto">{label}</span>
                </Tag>
            </Tooltip>
        </div>
    );
}
