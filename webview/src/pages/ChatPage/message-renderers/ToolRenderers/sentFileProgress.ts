import {useSyncExternalStore} from "react";

/**
 * How far the save of each file Claude sent has got, by the file's path, as a fraction from 0 to 1. The file card reads
 * it to fill its background while the file is being written; a file that is not being saved has no entry.
 */
const fractions = new Map<string, number>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Sets how far the save of `path` has got, or takes the entry away with `null`. */
export function setSentFileProgress(path: string, fraction: number | null): void {
    if (fraction === null) fractions.delete(path);
    else fractions.set(path, Math.min(1, Math.max(0, fraction)));
    listeners.forEach((listener) => listener());
}

/** The fraction written so far of the file at `path`, or null when it is not being saved. */
export function useSentFileProgress(path: string): number | null {
    return useSyncExternalStore(subscribe, () => fractions.get(path) ?? null);
}

/** @internal test-only. */
export function _resetSentFileProgress(): void {
    fractions.clear();
    listeners.forEach((listener) => listener());
}

/** How long a finished bar stays, full, before it goes: long enough to be seen on a file that took no time. */
export const FINISHED_BAR_MS = 600;
