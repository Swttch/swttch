import {useMemo} from "react";
import toast from "react-hot-toast";
import {useTranslation} from "@/i18n";
import {useSessionContext} from "@/contexts/SessionContext";
import {useBridgeContext} from "@/contexts/BridgeContext";
import {SessionFamilies} from "@/components/SessionList/families";
import {getRelativeTime} from "@/components/SessionList/utils";
import {RelationField, type RelationItem} from "@/components/RelationField";
import {MessageType} from "@/shared";
import type {SessionMetaDto} from "@/dto";

/**
 * The sessions this one is directly linked to: the one that started it (its parent) and the ones it
 * started itself (its children), drawn like the relation properties of a Notion page, with the means
 * to change both by hand.
 *
 * Only what is on hand is shown. The list a session sits in is paged by top-level session with every
 * family whole, so the children are always there and so is the parent when it runs in the same folder.
 * A parent in another folder is not in the list and is named as such rather than guessed at.
 *
 * The rail only draws this section while the session-management MCP is installed (see SessionRail):
 * who started whom is that package's record, and the edits are made by its own command.
 */
export function LinkedSessionsSection() {
    const {t} = useTranslation('chat');
    const {sessions, currentSessionId, switchSession} = useSessionContext();
    const {send} = useBridgeContext();

    const {parentId, parentItems, childItems, parentChoices, childChoices} = useMemo(() => {
        const held: SessionMetaDto[] = sessions ?? [];
        const families = SessionFamilies.of(held);
        const current = held.find((s) => s.id === currentSessionId);
        const parentId = current?.sessionMark?.parentSessionUid ?? null;
        const children = families.childrenOf(currentSessionId ?? '');
        const below = new Set(families.descendantsOf(currentSessionId ?? '').map((s) => s.id));
        const above = new Set<string>();
        for (let id = families.parentOf(currentSessionId ?? ''); id !== null; id = families.parentOf(id)) above.add(id);
        const others = held.filter((s) => s.id !== currentSessionId);
        const parent = held.find((s) => s.id === parentId);
        return {
            parentId,
            parentItems: parent ? [toItem(parent)] : [],
            childItems: children.map(toItem),
            // A session cannot be put under itself or under one of its own descendants; the one it is under already is held.
            parentChoices: others.filter((s) => !below.has(s.id) && s.id !== parentId).map(toItem),
            // Nor can its own ancestors, or sessions it already started, be added below it.
            childChoices: others.filter((s) => !above.has(s.id) && s.id !== parentId && s.sessionMark?.parentSessionUid !== currentSessionId).map(toItem),
        };
    }, [sessions, currentSessionId]);

    const setParent = async (sessionId: string, parentSessionId: string | null) => {
        try {
            const answer = await send(MessageType.SET_SESSION_PARENT, {sessionId, parentSessionId}) as {status?: string; error?: string};
            if (answer?.status !== 'ok') throw new Error(answer?.error ?? t('sessionRail.linked.failed'));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t('sessionRail.linked.failed'));
        }
    };

    const common = {
        onOpen: switchSession,
        searchPlaceholder: t('sessionRail.linked.searchPlaceholder'),
        listTitle: t('sessionRail.linked.listTitle'),
        noMatchLabel: t('sessionRail.linked.noMatch'),
        emptyLabel: t('sessionRail.linked.none'),
        openLabel: t('sessionRail.linked.open'),
    };

    return (
        <div className="flex flex-col gap-2 text-[0.8462rem]">
            <RelationField
                {...common}
                title={t('sessionRail.linked.parent')}
                removeLabel={t('sessionRail.linked.removeParent')}
                actionLabel={t('sessionRail.linked.change')}
                items={parentItems}
                hasMissing={parentId !== null && parentItems.length === 0}
                missingLabel={t('sessionRail.linked.notInList')}
                missingHint={t('sessionRail.linked.notInListHint')}
                candidates={parentChoices}
                onRemove={() => void setParent(currentSessionId ?? '', null)}
                // One parent only: picking another replaces the one held.
                onAdd={(id) => void setParent(currentSessionId ?? '', id)}
            />
            <RelationField
                {...common}
                title={t('sessionRail.linked.children')}
                removeLabel={t('sessionRail.linked.removeChild')}
                actionLabel={t('sessionRail.linked.addChild')}
                items={childItems}
                candidates={childChoices}
                onRemove={(id) => void setParent(id, null)}
                onAdd={(id) => void setParent(id, currentSessionId ?? '')}
                keepOpen
            />
        </div>
    );
}

function toItem(session: SessionMetaDto): RelationItem {
    return {id: session.id, title: session.title, fullTitle: session.fullTitle, hint: session.updatedAt ? getRelativeTime(session.updatedAt) : undefined};
}
