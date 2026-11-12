import {createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode} from "react";
import type {SentFileTarget} from "./SentFileMenu";

/**
 * Which of the files in one `SendUserFile` result are picked. Shift+click picks the run of files from the last one picked
 * to the one clicked; Shift+Cmd+click (Shift+Ctrl on Windows and Linux) adds one file to the pick or takes it out. A menu
 * opened on a picked file acts on all the picked files; on any other file it acts on that file alone.
 *
 * The pick belongs to the one result: the files of another message are not in it, since what a range runs over is the
 * order the files are drawn in, and that is known only here.
 */
export interface SentFileSelection {
    /** The paths that are picked. */
    selected: ReadonlySet<string>;
    /** Pick by range (Shift) or add or take out one (Shift+Cmd). */
    pick(file: SentFileTarget, mode: "range" | "toggle"): void;
    /** Let go of the pick. */
    clear(): void;
    /** What a menu opened on `file` acts on: the pick when `file` is in a pick of several, otherwise `file`. */
    targetsFor<T extends SentFileTarget>(file: T): T[];
}

const none: SentFileSelection = {
    selected: new Set(),
    pick: () => {},
    clear: () => {},
    targetsFor: (file) => [file],
};

const SelectionContext = createContext<SentFileSelection>(none);

export const useSentFileSelection = (): SentFileSelection => useContext(SelectionContext);

/** What a click on a card does to the pick, before it does anything else. */
export function pickModeOf(event: {shiftKey: boolean; metaKey: boolean; ctrlKey: boolean}): "range" | "toggle" | null {
    if (!event.shiftKey) return null;
    return event.metaKey || event.ctrlKey ? "toggle" : "range";
}

/**
 * Holds the pick for the files of one result, in the order they are drawn. The pick is let go of by Escape, by a click on
 * a card (which opens it as usual), and by a press anywhere that is neither a card nor a menu.
 */
export function SentFileSelectionProvider<T extends SentFileTarget>({files, children}: {files: T[]; children: ReactNode}) {
    const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
    const [anchor, setAnchor] = useState<string | null>(null);

    const clear = useCallback(() => {
        setSelected((current) => (current.size === 0 ? current : new Set()));
        setAnchor(null);
    }, []);

    const pick = useCallback((file: SentFileTarget, mode: "range" | "toggle") => {
        if (mode === "toggle") {
            setSelected((current) => {
                const next = new Set(current);
                if (!next.delete(file.path)) next.add(file.path);
                return next;
            });
            setAnchor(file.path);
            return;
        }
        // A range runs from the anchor to the file clicked, and replaces the pick; with no anchor it is that one file.
        const from = files.findIndex((candidate) => candidate.path === (anchor ?? file.path));
        const to = files.findIndex((candidate) => candidate.path === file.path);
        if (from < 0 || to < 0) {
            setSelected(new Set([file.path]));
        } else {
            setSelected(new Set(files.slice(Math.min(from, to), Math.max(from, to) + 1).map((candidate) => candidate.path)));
        }
        setAnchor((current) => current ?? file.path);
    }, [files, anchor]);

    const targetsFor = useCallback(<U extends SentFileTarget>(file: U): U[] => {
        if (selected.size < 2 || !selected.has(file.path)) return [file];
        return (files as unknown as U[]).filter((candidate) => selected.has(candidate.path));
    }, [files, selected]);

    useEffect(() => {
        if (selected.size === 0) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") clear();
        };
        const onPress = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest("[data-sent-file], [role=menu]")) return;
            clear();
        };
        document.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onPress);
        return () => {
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onPress);
        };
    }, [selected, clear]);

    const value = useMemo<SentFileSelection>(() => ({selected, pick, clear, targetsFor}), [selected, pick, clear, targetsFor]);
    return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}
