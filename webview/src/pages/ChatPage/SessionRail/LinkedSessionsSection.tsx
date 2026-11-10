import {useMemo} from "react";
import {useTranslation} from "@/i18n";
import {useSessionContext} from "@/contexts/SessionContext";
import type {SessionMetaDto} from "@/dto";

/**
 * The sessions this one is directly linked to: the one that started it (its
 * parent) and the ones it started itself (its children).
 *
 * Only what is on hand is shown. The list a session sits in is paged by top-level
 * session with every family whole, so the children are always there and so is the
 * parent when it runs in the same folder. A parent in another folder is not in the
 * list and is named as such rather than guessed at.
 *
 * The rail only draws this section while the session-management MCP is installed
 * (see SessionRail): who started whom is that package's record.
 */
export function LinkedSessionsSection() {
    const {t} = useTranslation('chat');
    const {sessions, currentSessionId, switchSession} = useSessionContext();

    const {parentId, parent, children} = useMemo(() => {
        const held: SessionMetaDto[] = sessions ?? [];
        const current = held.find((s) => s.id === currentSessionId);
        const parentId = current?.sessionMark?.parentSessionUid ?? null;
        const children = held
            .filter((s) => s.sessionMark?.parentSessionUid === currentSessionId)
            .sort((a, b) => startedAt(a) - startedAt(b));
        return {parentId, parent: held.find((s) => s.id === parentId), children};
    }, [sessions, currentSessionId]);

    return (
        <div className="flex flex-col gap-2 text-[0.8462rem]">
            <div>
                <h4 className="pb-0.5 text-text-secondary">{t('sessionRail.linked.parent')}</h4>
                {parentId === null ? (
                    <None/>
                ) : parent ? (
                    <SessionRow session={parent} onOpen={switchSession}/>
                ) : (
                    <p className="py-0.5 text-text-tertiary">{t('sessionRail.linked.notInList')}</p>
                )}
            </div>
            <div>
                <h4 className="pb-0.5 text-text-secondary">{t('sessionRail.linked.children')}</h4>
                {children.length === 0 ? (
                    <None/>
                ) : (
                    <ul className="flex flex-col">
                        {children.map((child) => (
                            <li key={child.id}>
                                <SessionRow session={child} onOpen={switchSession}/>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

function None() {
    const {t} = useTranslation('chat');
    return <p className="py-0.5 text-text-tertiary">{t('sessionRail.linked.none')}</p>;
}

function SessionRow({session, onOpen}: {session: SessionMetaDto; onOpen: (sessionId: string) => void}) {
    return (
        <button
            type="button"
            title={session.title}
            onClick={() => onOpen(session.id)}
            className="w-full truncate rounded px-1 py-0.5 text-start text-text-primary hover:bg-[var(--surface-selected)]"
        >
            {session.title}
        </button>
    );
}

/** When the session was started: what the package recorded, else when its transcript began. */
function startedAt(session: SessionMetaDto): number {
    return session.sessionMark?.startedAt || session.createdAt?.getTime() || 0;
}
