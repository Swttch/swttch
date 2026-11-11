import {useMemo} from "react";
import toast from "react-hot-toast";
import {useTranslation} from "@/i18n";
import {useSessionContext} from "@/contexts/SessionContext";
import {useBridgeContext} from "@/contexts/BridgeContext";
import {SessionFamilies, starterIdOf} from "@/components/SessionList/families";
import {isArchivedMark} from "@/components/SessionList/archive";
import {getRelativeTime} from "@/components/SessionList/utils";
import {RelationField, type RelationItem} from "@/components/RelationField";
import {Tooltip} from "@/components/Tooltip";
import claudeLogo from "@/assets/claude-logo.svg";
import {Section} from "./Section";
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
    const archivedLabel = t('sessionRail.linked.archived');

    const {parentId, parentItems, childItems, parentChoices, childChoices, apart, hasDesktopRecord} = useMemo(() => {
        const held: SessionMetaDto[] = sessions ?? [];
        const families = SessionFamilies.of(held);
        const current = held.find((s) => s.id === currentSessionId);
        const parentId = starterIdOf(current?.sessionMark);
        const children = families.childrenOf(currentSessionId ?? '');
        const below = new Set(families.descendantsOf(currentSessionId ?? '').map((s) => s.id));
        const above = new Set<string>();
        for (let id = families.parentOf(currentSessionId ?? ''); id !== null; id = families.parentOf(id)) above.add(id);
        const others = held.filter((s) => s.id !== currentSessionId);
        const parent = held.find((s) => s.id === parentId);
        // The links of this session (its own parent, and the sessions the desktop app says it started) that were set
        // by hand to something other than what the Claude desktop app records. A link only the package knows of has no
        // desktop record and is left alone.
        const apart = held.filter((s) => {
            const desktop = s.sessionMark?.desktopParentSessionId;
            const chosen = s.sessionMark?.parentSessionUid;
            if (!desktop || typeof chosen !== 'string' || chosen === desktop) return false;
            return s.id === currentSessionId || desktop === currentSessionId;
        }).map((s) => s.id);
        // Whether the desktop app records any link of this session at all.
        const hasDesktopRecord = held.some((s) => !!s.sessionMark?.desktopParentSessionId && (s.id === currentSessionId || s.sessionMark.desktopParentSessionId === currentSessionId));
        return {
            apart,
            hasDesktopRecord,
            parentId,
            parentItems: parent ? [toItem(parent, archivedLabel)] : [],
            childItems: children.map((s) => toItem(s, archivedLabel)),
            // A session cannot be put under itself or under one of its own descendants; the one it is under already is held.
            parentChoices: others.filter((s) => !below.has(s.id) && s.id !== parentId).map((s) => toItem(s, archivedLabel)),
            // Nor can its own ancestors, or sessions it already started, be added below it.
            childChoices: others.filter((s) => !above.has(s.id) && s.id !== parentId && starterIdOf(s.sessionMark) !== currentSessionId).map((s) => toItem(s, archivedLabel)),
        };
    }, [sessions, currentSessionId, archivedLabel]);

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

    const resetToDesktop = async () => {
        for (const id of apart) {
            try {
                const answer = await send(MessageType.SET_SESSION_PARENT, {sessionId: id, parentSessionId: null, inherit: true}) as {status?: string; error?: string};
                if (answer?.status !== 'ok') throw new Error(answer?.error ?? t('sessionRail.linked.failed'));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : t('sessionRail.linked.failed'));
                return;
            }
        }
    };

    // The tooltip says what the button does now: reset the links, or why there is nothing to reset. It is not `disabled`
    // because a disabled button gets no pointer events, and so no tooltip.
    const canReset = apart.length > 0;
    const resetHint = canReset
        ? t('sessionRail.linked.resetToDesktop')
        : t(hasDesktopRecord ? 'sessionRail.linked.resetSynced' : 'sessionRail.linked.resetNoRecord');
    const resetButton = (
        <Tooltip content={resetHint} placement="bottom">
            <button
                type="button"
                aria-label={t('sessionRail.linked.resetToDesktop')}
                aria-disabled={!canReset}
                onClick={() => {
                    if (canReset) void resetToDesktop();
                }}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${canReset ? 'hover:bg-surface-hover' : 'cursor-default opacity-40'}`}
            >
                <img src={claudeLogo} alt="" className="h-4 w-4"/>
            </button>
        </Tooltip>
    );

    return (
        <Section title={t('sessionRail.linked.title')} defaultOpen action={resetButton}>
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
        </Section>
    );
}

function toItem(session: SessionMetaDto, archivedLabel: string): RelationItem {
    return {
        id: session.id,
        title: session.title,
        fullTitle: session.fullTitle,
        hint: session.updatedAt ? getRelativeTime(session.updatedAt) : undefined,
        archived: isArchivedMark(session.sessionMark),
        archivedLabel,
    };
}
