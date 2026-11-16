import {useState} from "react";
import {useApi, useSessionContext} from "@/contexts";
import { SessionState } from "@/types";
import { useTranslation } from '@/i18n';

export function isSessionConflict(error: Error): boolean {
    return error.message.includes('already in use');
}


export const SessionConflictErrorBanner = () => {
    const { currentSessionId, workingDirectory, setSessionState } = useSessionContext();
    const api = useApi();
    const [isReclaiming, setIsReclaiming] = useState(false);
    const { t } = useTranslation('chat');

    const handleReclaim = async () => {
        if (!currentSessionId || !workingDirectory || isReclaiming) return;
        setIsReclaiming(true);
        try {
            await api.sessions.reclaim(currentSessionId);
            // SESSION_LOADED 이벤트 → loadMessages → setError(null) 자동 처리
            setSessionState(SessionState.Idle);
        } catch (e) {
            console.error('[StreamErrorBanner] Reclaim failed:', e);
        } finally {
            setIsReclaiming(false);
        }
    };

    return (
        <div className="mx-4 my-2 px-3 py-2 rounded-md bg-state-error-bg border border-state-error-border text-state-error-fg text-xs flex items-center justify-between gap-2">
            <span>{t('streamError.sessionConflict.message')}</span>
            <button
                onClick={handleReclaim}
                disabled={isReclaiming}
                className="shrink-0 px-2 py-0.5 rounded bg-state-error-bg hover:bg-state-error-border text-state-error-fg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                {isReclaiming ? (
                    <span className="inline-flex items-center gap-1">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {t('streamError.sessionConflict.reclaiming')}
            </span>
                ) : (
                    t('streamError.sessionConflict.reclaim')
                )}
            </button>
        </div>
    );
};
