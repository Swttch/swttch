import {useEffect, useRef, useState} from "react";
import {useTranslation} from "@/i18n";
import {TOGGLE_SESSION_RAIL_EVENT} from "./event";
import {Section} from "./Section";
import {EnvironmentSection} from "./EnvironmentSection";
import {ContextSection} from "./ContextSection";
import {OutputsSection} from "./OutputsSection";

/**
 * The session rail: a panel of the session's environment, context usage and
 * outputs, as Claude Desktop shows beside the chat. Opened from the header dock
 * (#593); it lists the session's published pages, sent files and pictures, which
 * is where the terminal's `/artifacts` list lives here.
 *
 * It floats under the header instead of taking a column, since an IDE tool
 * window has no width to spare. Escape and a click outside close it.
 */
export function SessionRail() {
    const {t} = useTranslation('chat');
    const [open, setOpen] = useState(false);
    const [contextOpen, setContextOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const toggle = () => setOpen((value) => !value);
        window.addEventListener(TOGGLE_SESSION_RAIL_EVENT, toggle);
        return () => window.removeEventListener(TOGGLE_SESSION_RAIL_EVENT, toggle);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            const target = e.target as Element | null;
            // The dock icon toggles on its own click; closing here too would reopen it at once.
            if (rootRef.current?.contains(target as Node) || target?.closest('[data-session-rail-toggle]')) return;
            setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    if (!open) return null;

    return (
        <div
            ref={rootRef}
            role="dialog"
            aria-label={t('sessionRail.title')}
            className="fixed end-2 top-10 z-40 max-h-[calc(100vh-5rem)] w-[min(340px,calc(100vw-1rem))] overflow-y-auto rounded-lg
                       border border-border-default bg-surface-overlay shadow-lg"
        >
            <Section title={t('sessionRail.environment')} defaultOpen>
                <EnvironmentSection/>
            </Section>
            <Section title={t('sessionRail.context')} defaultOpen={false} onToggle={setContextOpen}>
                <ContextSection open={contextOpen}/>
            </Section>
            <Section title={t('sessionRail.outputs')} defaultOpen>
                <OutputsSection/>
            </Section>
        </div>
    );
}
