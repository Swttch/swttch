import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Portal} from "./Portal";
import {Tooltip} from "./Tooltip";
import {SessionActivity} from "@/shared";
import {ActivityDot} from "@/components/SessionList/SessionItem";

/** One page-like thing a relation points at: a session, here. */
export interface RelationItem {
    id: string;
    title: string;
    /** The whole title, where `title` may be cut short to fit a row. Said in full in the row's tooltip. */
    fullTitle?: string;
    /** A dim word after the title in the picker, e.g. how long ago. */
    hint?: string;
    /** The session is archived: its title is led by a pill that says so. */
    archived?: boolean;
    /** The word on that pill. */
    archivedLabel?: string;
    /** What the session is doing now, when it is doing something: a turn running, or waiting on an answer. */
    activity?: SessionActivity;
}

/** The small pill that leads the title of an archived session. */
function ArchivedPill({label}: {label?: string}) {
    return (
        <span data-testid="archived-pill" className="shrink-0 rounded-full bg-surface-hover px-1.5 text-[0.6875rem] leading-4 text-text-secondary">
            {label}
        </span>
    );
}

interface Props {
    /** The name of the relation, drawn above its rows. */
    title: string;
    /** The words of the button after the title that opens the picker (Change, Add). */
    actionLabel: string;
    /** What the relation holds now, drawn as rows. */
    items: RelationItem[];
    /** What the picker offers: everything that may be added, the held items excluded. */
    candidates: RelationItem[];
    onOpen: (id: string) => void;
    onRemove: (id: string) => void;
    onAdd: (id: string) => void;
    /** Shown while the relation is empty. */
    emptyLabel: string;
    /** Shown instead of a row whose target is not on hand. */
    missingLabel?: string;
    /** Said in the tooltip of that row: why a target may not be on hand. */
    missingHint?: string;
    /** The relation holds a target that is not among `items` (it could not be found). */
    hasMissing?: boolean;
    searchPlaceholder: string;
    listTitle: string;
    noMatchLabel: string;
    removeLabel: string;
    /** What clicking a row does, said under the row's full title in its tooltip. */
    openLabel: string;
    /** Keep the picker open after a pick, so several can be added in a row. */
    keepOpen?: boolean;
}

/**
 * A relation property drawn the way Notion draws one in a page's properties: the linked pages as rows
 * (a page icon, the title underlined, a square button that unlinks it on hover), "empty" while there are
 * none, and a button after the title that opens a search box over the pages that can still be linked.
 *
 * The picker is plain DOM in a Portal, not a native <select>: the OS draws a select's popup as a window
 * of its own, which the IDE's embedded browser puts in the wrong place (see components/Select).
 */
export function RelationField(props: Props) {
    const {
        title, actionLabel, items, candidates, onOpen, onRemove, onAdd, emptyLabel, missingLabel, missingHint, hasMissing = false,
        searchPlaceholder, listTitle, noMatchLabel, removeLabel, openLabel, keepOpen = false,
    } = props;
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        // Outside is everything but the list and the button that opens it: the field's own rows and blank
        // space count as outside too. The button toggles by itself, so the press that closes the list
        // must not be taken as one that opens it again. Listened to in the capture phase so nothing
        // between the page and this can swallow the press.
        const onPointerDown = (e: MouseEvent) => {
            const target = e.target as Node;
            if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            // The press that dismisses the list is only that: the rail around it does not take it as
            // a press outside itself and close too (Escape behaves the same).
            e.stopPropagation();
            setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // The rail closes on Escape too; this closes only the picker that is open.
                e.stopPropagation();
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('mousedown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open]);

    const isEmpty = items.length === 0 && !hasMissing;

    return (
        <div ref={anchorRef} className="flex flex-col">
            <div className="flex items-center gap-2 pb-0.5">
                <h4 className="text-text-secondary">{title}</h4>
                <button
                    ref={triggerRef}
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((value) => !value)}
                    className="ms-auto rounded px-1 text-xs text-text-tertiary hover:bg-surface-hover hover:text-text-primary"
                >
                    {actionLabel}
                </button>
            </div>
            {items.map((item) => (
                <div key={item.id} className="group/row flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--surface-selected)]">
                    <Tooltip content={<OpenTip title={item.fullTitle || item.title} openLabel={openLabel}/>} placement="bottom">
                        <button
                            type="button"
                            onClick={() => onOpen(item.id)}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-start text-text-primary"
                        >
                            <PageIcon/>
                            {item.activity && item.activity !== SessionActivity.Idle && (
                                <ActivityDot activity={item.activity} isOpen/>
                            )}
                            {item.archived && <ArchivedPill label={item.archivedLabel}/>}
                            <span className="truncate underline decoration-text-tertiary/60 underline-offset-1">{item.title}</span>
                        </button>
                    </Tooltip>
                    <UnlinkButton label={removeLabel} onClick={() => onRemove(item.id)}/>
                </div>
            ))}
            {hasMissing && (
                // A target that cannot be found (its transcript is gone, or it is in a folder this list does not
                // cover) still has to be unlinkable: the link is a record of its own and outlives the session.
                <div className="group/row flex items-center gap-1 rounded px-1 py-0.5 hover:bg-[var(--surface-selected)]">
                    <Tooltip content={missingHint} placement="bottom">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-text-tertiary">
                            <PageIcon/>
                            <span className="truncate">{missingLabel}</span>
                        </span>
                    </Tooltip>
                    <UnlinkButton label={removeLabel} onClick={() => onRemove('')}/>
                </div>
            )}
            {isEmpty && (
                <p className="px-1 py-0.5 text-text-tertiary">{emptyLabel}</p>
            )}
            {open && (
                <RelationPicker
                    anchorRef={anchorRef}
                    menuRef={menuRef}
                    candidates={candidates}
                    searchPlaceholder={searchPlaceholder}
                    listTitle={listTitle}
                    noMatchLabel={noMatchLabel}
                    onPick={(id) => {
                        onAdd(id);
                        if (!keepOpen) setOpen(false);
                    }}
                />
            )}
        </div>
    );
}

function RelationPicker({anchorRef, menuRef, candidates, searchPlaceholder, listTitle, noMatchLabel, onPick}: {
    anchorRef: React.RefObject<HTMLDivElement>;
    menuRef: React.RefObject<HTMLDivElement>;
    candidates: RelationItem[];
    searchPlaceholder: string;
    listTitle: string;
    noMatchLabel: string;
    onPick: (id: string) => void;
}) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [pos, setPos] = useState<{left: number; top: number; width: number} | null>(null);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        return q === '' ? candidates : candidates.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
    }, [candidates, query]);

    useLayoutEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        // <html> carries CSS zoom on some hosts: place in visual px, then divide by zoom (see components/Select).
        const zoom = parseFloat(document.documentElement.style.zoom) || 1;
        const gap = 4;
        const pad = 8;
        const height = Math.min(menuRef.current?.offsetHeight ?? 320, 320) * zoom;
        const below = window.innerHeight - rect.bottom;
        const up = below < height + gap && rect.top > below;
        const width = Math.min(Math.max(rect.width, 280 * zoom), window.innerWidth - 2 * pad);
        const left = Math.min(Math.max(pad, rect.left), window.innerWidth - width - pad);
        setPos({left: left / zoom, top: (up ? rect.top - height - gap : rect.bottom + gap) / zoom, width: width / zoom});
    }, [anchorRef, menuRef, shown.length]);

    useEffect(() => {
        menuRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({block: 'nearest'});
    }, [active, menuRef]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, shown.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            const pick = shown[active];
            if (pick) {
                e.preventDefault();
                onPick(pick.id);
            }
        }
    };

    return (
        <Portal>
            <div
                ref={menuRef}
                role="dialog"
                // The session rail closes on a click outside itself; this list is drawn outside the rail.
                data-session-rail-popover
                className="fixed z-[100] flex max-h-80 flex-col overflow-hidden rounded-lg border border-border-default bg-surface-raised shadow-xl"
                style={{left: pos?.left ?? 0, top: pos?.top ?? 0, width: pos?.width ?? 280}}
            >
                <input
                    type="text"
                    autoFocus
                    value={query}
                    placeholder={searchPlaceholder}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setActive(0);
                    }}
                    onKeyDown={onKeyDown}
                    className="w-full border-b border-border-default bg-transparent px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
                />
                <p className="px-3 pb-1 pt-2 text-xs text-text-tertiary">{listTitle}</p>
                <div role="listbox" className="overflow-y-auto pb-1">
                    {shown.length === 0 && <p className="px-3 py-2 text-sm text-text-tertiary">{noMatchLabel}</p>}
                    {shown.map((item, index) => (
                        <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={index === active}
                            data-index={index}
                            onClick={() => onPick(item.id)}
                            onMouseEnter={() => setActive(index)}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm text-text-primary ${index === active ? 'bg-surface-hover' : ''}`}
                        >
                            <PageIcon/>
                            {item.archived && <ArchivedPill label={item.archivedLabel}/>}
                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                            {item.hint && <span className="shrink-0 text-xs text-text-tertiary">{item.hint}</span>}
                        </button>
                    ))}
                </div>
            </div>
        </Portal>
    );
}

/** The square button that unlinks a row, shown while the row is hovered. */
function UnlinkButton({label, onClick}: {label: string; onClick: () => void}) {
    return (
        <Tooltip content={label}>
            <button
                type="button"
                aria-label={label}
                onClick={onClick}
                // On a ground of its own that tells it apart from the row's highlight, and reacts to the pointer by itself.
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border-default bg-surface-overlay text-text-secondary opacity-0 hover:bg-surface-hover hover:text-text-primary focus-visible:opacity-100 group-hover/row:opacity-100"
            >
                <MinusIcon/>
            </button>
        </Tooltip>
    );
}

/** The tooltip of a row: the whole title, which the row may have cut short, and what a click does. */
function OpenTip({title, openLabel}: {title: string; openLabel: string}) {
    return (
        <div className="flex flex-col gap-0.5">
            {/* The tooltip box breaks anywhere (break-all). A title is words: break between them, and only
                inside a word when one is longer than the line. */}
            <span className="whitespace-pre-wrap font-medium text-text-primary [overflow-wrap:anywhere] [word-break:normal]">{title}</span>
            <span className="text-text-tertiary">{openLabel}</span>
        </div>
    );
}

function PageIcon() {
    return (
        <svg className="h-5 w-5 shrink-0 text-text-secondary" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 1.75h5.2L12.25 4.8V13a1.25 1.25 0 0 1-1.25 1.25H4A1.25 1.25 0 0 1 2.75 13V3A1.25 1.25 0 0 1 4 1.75Z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/>
            <path d="M5.5 8h5M5.5 10.5h5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
        </svg>
    );
}

function MinusIcon() {
    return (
        <svg className="h-4 w-4" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M2.5 7h9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
    );
}
