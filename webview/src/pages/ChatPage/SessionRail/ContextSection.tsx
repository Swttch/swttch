import {useCallback, useEffect, useRef, useState} from "react";
import {useBridgeContext} from "@/contexts/BridgeContext";
import {useChatStreamContext} from "@/contexts/ChatStreamContext";
import {useSessionContext} from "@/contexts/SessionContext";
import {useTranslation} from "@/i18n";
import {MessageType} from "@/shared";
import {parseContextUsage, type ContextUsage} from "@/utils/parseContextUsage";

/** Segment colours by the CLI's category name; anything else is grey, and free space has no colour. */
const CATEGORY_COLOURS: Record<string, string> = {
    'Messages': 'bg-blue-500',
    'Memory files': 'bg-orange-500',
    'MCP tools': 'bg-emerald-500',
};
const FREE_SPACE = /^free space$/i;

interface ContextUsageAck {
    status?: string;
    markdown?: string;
}

/**
 * Where the context window goes, from the official `/context` command: the same
 * report the Context card of Claude Desktop's session rail draws.
 *
 * It asks once when the section opens, and asks again when a running turn ends,
 * because the report describes the window as it stood at the last reply.
 */
export function ContextSection({open}: {open: boolean}) {
    const {t} = useTranslation('chat');
    const bridge = useBridgeContext();
    const {currentSessionId, workingDirectory} = useSessionContext();
    const {isStreaming} = useChatStreamContext();
    const [usage, setUsage] = useState<ContextUsage | null>(null);
    const [failed, setFailed] = useState(false);
    const [loading, setLoading] = useState(false);
    const sessionRef = useRef(currentSessionId);
    sessionRef.current = currentSessionId;

    const ask = useCallback(() => {
        if (!currentSessionId || !bridge.isConnected) return;
        const sessionId = currentSessionId;
        setLoading(true);
        bridge
            .send(MessageType.GET_CONTEXT_USAGE, {sessionId, workingDir: workingDirectory ?? ''})
            .then((response) => {
                if (sessionRef.current !== sessionId) return;
                const ack = response as ContextUsageAck | null;
                const parsed = ack?.status === 'ok' && ack.markdown ? parseContextUsage(ack.markdown) : null;
                setUsage(parsed);
                setFailed(parsed === null);
            })
            .catch(() => setFailed(true))
            .finally(() => setLoading(false));
    }, [bridge, currentSessionId, workingDirectory]);

    useEffect(() => {
        if (open && !isStreaming) ask();
    }, [open, isStreaming, ask]);

    if (!usage) {
        return (
            <p className="py-1 text-[0.8462rem] text-text-tertiary">
                {failed ? t('sessionRail.contextUnavailable') : t('sessionRail.contextLoading')}
            </p>
        );
    }

    return (
        <div className="text-[0.8462rem]" aria-busy={loading}>
            <div className="flex items-baseline justify-between text-text-primary">
                <span>{t('sessionRail.contextUsed', {percent: usage.percentUsed})}</span>
                <span className="text-text-tertiary">{usage.tokensUsedLabel} / {usage.tokensTotalLabel}</span>
            </div>
            <div className="my-2 flex h-1 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden="true">
                {usage.categories.filter((c) => !FREE_SPACE.test(c.name) && c.tokens > 0).map((c) => (
                    <div
                        key={c.name}
                        className={CATEGORY_COLOURS[c.name] ?? 'bg-text-tertiary'}
                        style={{width: `${Math.max(c.percent, 0.5)}%`}}
                    />
                ))}
            </div>
            <ul className="flex flex-col gap-0.5">
                {usage.categories.map((c) => (
                    <li key={c.name} className="flex items-center gap-2 py-0.5">
                        <span
                            className={`h-2 w-2 shrink-0 rounded-[2px] ${FREE_SPACE.test(c.name) ? 'border border-text-tertiary' : (CATEGORY_COLOURS[c.name] ?? 'bg-text-tertiary')}`}
                            aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate text-text-secondary" dir="auto">{c.name}</span>
                        <span className="text-text-tertiary">{c.tokensLabel}</span>
                        <span className="w-12 text-end text-text-primary">{c.percent}%</span>
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[0.7692rem] text-text-tertiary">{t('sessionRail.contextNote')}</p>
        </div>
    );
}
