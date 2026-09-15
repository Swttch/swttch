import type { UsageLimit, UsageResponse } from '@/types/usage';

/** A model-scoped window, ready to render next to the named ones. */
export interface ScopedWindow {
    label: string;
    utilization: number;
    resetsAt: string | null;
}

/**
 * The model-scoped weekly windows, as rows this panel can draw.
 *
 * Entries that repeat a window the named fields already carry are dropped, so an "Opus"
 * scoped entry sitting alongside a populated `seven_day_opus` does not render the same
 * bar twice. Anything the named fields have no slot for — Fable today, whatever follows
 * it tomorrow — comes through on its own name.
 */
export function scopedWindows(usage: UsageResponse | null | undefined): ScopedWindow[] {
    if (!usage || !Array.isArray(usage.limits)) return [];

    const covered = new Set<string>();
    if (usage.seven_day_opus) covered.add('opus');
    if (usage.seven_day_sonnet) covered.add('sonnet');

    const out: ScopedWindow[] = [];
    for (const entry of usage.limits as UsageLimit[]) {
        if (!entry || typeof entry !== 'object' || entry.kind !== 'weekly_scoped') continue;
        const model = entry.scope?.model;
        const label = model?.display_name?.trim() || model?.id?.trim();
        if (!label) continue;
        if (covered.has(label.toLowerCase())) continue;
        const utilization = Number(entry.percent);
        if (!Number.isFinite(utilization)) continue;
        out.push({ label, utilization, resetsAt: entry.resets_at ?? null });
    }
    return out;
}
