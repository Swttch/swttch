import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ICON_FRAMES, TEXT_CHANGE_DELAYS, getVerbs } from './constants.ts';
import { useScramble } from './useScramble.ts';
import { randomPick } from './utils.ts';
import { useTranslation } from '@/i18n';

interface Props {
    /**
     * Seconds left before a dropped connection ends this turn, appended to the verb
     * as "(7s)". Null or omitted while the connection is up.
     *
     * Without it a lost backend looks exactly like a slow one: the same verbs
     * scrambling on forever, with nothing saying we noticed (#446).
     */
    countdownSeconds?: number | null;
    /**
     * The CLI's retry progress, shown as "(retry 3/10)".
     *
     * The CLI re-sends a failed request up to ten times with a widening backoff, which
     * can run for minutes. Without this the screen is an unchanging spinner and reads as
     * frozen — the reporter of #446 described it as "stuck forever". We cannot shorten
     * the retries (the CLI owns that schedule), so the least we do is show them.
     *
     * Yields to `countdownSeconds`: once the connection is gone, retry progress is the
     * last thing we heard rather than what is happening now.
     */
    apiRetry?: { attempt: number; max: number } | null;
}

export const StreamingIndicator: React.FC<Props> = ({ countdownSeconds = null, apiRetry = null }) => {
    // 아이콘 프레임 인덱스
    const [frameIdx, setFrameIdx] = useState(0);

    // 현재 동사
    const [verb, setVerb] = useState<string>(() => randomPick(getVerbs()));

    // 텍스트 변경 카운트 (딜레이 스케줄 추적)
    const changeCountRef = useRef<number>(0);
    const textTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 다음 텍스트 변경 딜레이 계산
    const getNextDelay = useCallback(() => {
        const count = changeCountRef.current;
        if (count === 0) return TEXT_CHANGE_DELAYS[0];
        if (count === 1) return TEXT_CHANGE_DELAYS[1];
        return TEXT_CHANGE_DELAYS[2];
    }, []);

    // 텍스트 변경 스케줄링
    const scheduleNextChange = useCallback((currentVerb: string) => {
        if (textTimerRef.current !== null) {
            clearTimeout(textTimerRef.current);
        }
        const delay = getNextDelay();
        textTimerRef.current = setTimeout(() => {
            const next = randomPick(getVerbs(), currentVerb);
            changeCountRef.current += 1;
            setVerb(next);
        }, delay);
    }, [getNextDelay]);

    // 아이콘 인터벌 (120ms)
    useEffect(() => {
        const interval = setInterval(() => {
            setFrameIdx((prev) => (prev + 1) % ICON_FRAMES.length);
        }, 120);
        return () => clearInterval(interval);
    }, []);

    // 텍스트 변경 스케줄 초기화
    useEffect(() => {
        scheduleNextChange(verb);
        // verb가 바뀔 때마다 다음 변경을 재스케줄
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [verb]);

    // cleanup
    useEffect(() => {
        return () => {
            if (textTimerRef.current !== null) {
                clearTimeout(textTimerRef.current);
            }
        };
    }, []);

    // 스크램블 디스플레이
    const displayText = useScramble(verb);
    const { t } = useTranslation('chat');

    return (
        <div>
            <div className="group pt-2 pb-4 ps-[22px] pe-3">
                <div className="flex items-start gap-3">
                    {/* 아이콘 프레임 */}
                    <span className="text-accent-primary mt-[3px] text-[0.8461rem] leading-none select-none w-3 text-center shrink-0">
                        {ICON_FRAMES[frameIdx]}
                    </span>

                    {/* 스크램블 텍스트 */}
                    <div className="flex-1 min-w-0">
                        <span className="text-text-tertiary text-base font-mono">
                            {displayText}...
                        </span>
                        {/* Outside the scrambling span on purpose: the text must stay
                            readable while the verb dissolves into dots and underscores.
                            Dimmer than the verb, not louder: this is progress detail, not a
                            warning, and a bright badge beside a calm spinner reads as an
                            alert about something the user is supposed to act on. */}
                        {countdownSeconds !== null ? (
                            <span className="text-text-tertiary/70 text-base font-mono ms-2">
                                ({countdownSeconds}s)
                            </span>
                        ) : apiRetry ? (
                            <span className="text-text-tertiary/70 text-base font-mono ms-2">
                                ({t('streamingIndicator.retry', { attempt: apiRetry.attempt, max: apiRetry.max })})
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
};
