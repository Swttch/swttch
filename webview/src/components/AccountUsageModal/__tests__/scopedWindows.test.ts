import { describe, it, expect } from 'vitest';
import { scopedWindows } from '../scopedWindows';
import type { UsageResponse } from '@/types/usage';

const EMPTY: UsageResponse = {
    five_hour: null,
    seven_day: null,
    seven_day_oauth_apps: null,
    seven_day_sonnet: null,
    seven_day_opus: null,
    seven_day_cowork: null,
    iguana_necktie: null,
    extra_usage: null,
};

describe('scopedWindows', () => {
    it('is empty when the payload carries no limits array', () => {
        expect(scopedWindows(EMPTY)).toEqual([]);
        expect(scopedWindows(null)).toEqual([]);
    });

    /**
     * The window that started this: the API reports a Fable weekly limit only inside
     * `limits`, and a panel that walks the named fields draws nothing for it.
     */
    it('surfaces a model-scoped weekly window under the name the API gave it', () => {
        const usage = {
            ...EMPTY,
            limits: [{
                kind: 'weekly_scoped',
                percent: 3,
                resets_at: '2026-09-19T01:00:00Z',
                scope: { model: { display_name: 'Fable' } },
            }],
        } as UsageResponse;

        expect(scopedWindows(usage)).toEqual([
            { label: 'Fable', utilization: 3, resetsAt: '2026-09-19T01:00:00Z' },
        ]);
    });

    // A scoped entry beside the named field for the same model would draw the bar twice.
    it('drops an entry the named fields already cover', () => {
        const usage = {
            ...EMPTY,
            seven_day_opus: { utilization: 12, resets_at: '2026-09-19T01:00:00Z' },
            limits: [{ kind: 'weekly_scoped', percent: 12, scope: { model: { display_name: 'Opus' } } }],
        } as UsageResponse;

        expect(scopedWindows(usage)).toEqual([]);
    });

    it('ignores entries of another kind', () => {
        const usage = {
            ...EMPTY,
            limits: [{ kind: 'five_hour_scoped', percent: 5, scope: { model: { display_name: 'Fable' } } }],
        } as UsageResponse;

        expect(scopedWindows(usage)).toEqual([]);
    });

    it('falls back to the model id when there is no display name', () => {
        const usage = {
            ...EMPTY,
            limits: [{ kind: 'weekly_scoped', percent: 7, scope: { model: { id: 'claude-fable-5-1' } } }],
        } as UsageResponse;

        expect(scopedWindows(usage)).toEqual([
            { label: 'claude-fable-5-1', utilization: 7, resetsAt: null },
        ]);
    });

    it('skips an entry with no usable percentage or name', () => {
        const usage = {
            ...EMPTY,
            limits: [
                { kind: 'weekly_scoped', percent: Number.NaN, scope: { model: { display_name: 'Fable' } } },
                { kind: 'weekly_scoped', percent: 4, scope: { model: {} } },
            ],
        } as UsageResponse;

        expect(scopedWindows(usage)).toEqual([]);
    });
});
