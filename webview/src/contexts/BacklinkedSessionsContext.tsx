import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useBridge } from '@/hooks/useBridge';
import { activityOf, useSessionActivity } from '@/hooks/useSessionActivity';
import {
  DESKTOP_SESSION_KEY,
  DESKTOP_SESSION_STALE_MS,
  readDesktopSession,
  useDesktopSession,
  type DesktopSession,
} from '@/hooks/useDesktopSession';
import { MessageType, SessionActivity } from '@/shared';
import { useSessionContextOrNull } from '@/contexts/SessionContext';
import { useWorkingDirOrNull } from '@/contexts/WorkingDirContext';

/**
 * What this chat knows of a session its transcript points at (a card for a session Claude started, a link to one
 * in the text, a message sent to one), kept as one record so that every place that names the session shows the same
 * thing at the same moment: the card, the markdown link, the line a message came from.
 *
 * A field is absent when nothing says it.
 */
export interface BacklinkedSession {
  /** The id the transcript names the session by: Desktop's (`local_…`) or the CLI's. */
  ref: string;
  /** The CLI session it runs: the id this app's own sessions are named by. */
  cliSessionId?: string;
  /** The name it has now, which changes when the session is renamed. */
  title?: string;
  /** The folder it works in. */
  cwd?: string;
  isArchived?: boolean;
  /** The session was deleted: its transcript is gone. */
  missing?: boolean;
  /** Whether it stopped to wait for the person. */
  awaitingPerson?: boolean;
  lastActivityAt?: number;
  /** What it is doing now: running a turn, waiting for the person, finished with a response not yet read (`done`), or nothing. */
  activity: SessionActivity;
}

type Backlinks = ReadonlyMap<string, BacklinkedSession>;

/** Whether a session is archived: the desktop app says so, or the session-management MCP archived it (and did not bring it back). */
function archivedOf(desktop: boolean | undefined, mark: { desktopArchived?: boolean; archivedAt?: number } | undefined): boolean | undefined {
  if (desktop !== undefined) return desktop;
  if (!mark) return undefined;
  return mark.desktopArchived === true || (typeof mark.archivedAt === 'number' && mark.archivedAt > 0);
}

interface BacklinkedSessionsContextValue {
  /** The sessions the transcript points at, by the id it names them by and by their CLI id. The single source of what they look like. */
  sessions: Backlinks;
  /** A place that names `ref` is on the screen: it is read and kept up to date for as long as one is. Returns the way to say it is gone. */
  register: (ref: string) => () => void;
}

const BacklinkedSessionsContext = createContext<BacklinkedSessionsContextValue | null>(null);

/** A change of the sessions' names or marks comes in a burst; the records are read again once it settles. */
const REFRESH_AFTER_MS = 400;

/**
 * The sessions the open conversation points at, as one map from a session id to its record.
 *
 * Places that name a session ask for it by id (`useBacklinkedSession`); this provider reads each one once however
 * many places name it, and keeps the records current:
 * - what the Claude desktop app records (name, folder, archived, waiting for the person) is read again when the
 *   sessions' names or marks change anywhere, and when the session's activity changes;
 * - what each session is doing comes from the one stream the backend pushes, not from a stream per card;
 * - for a session this app lists (started by the session-management MCP), the list's name and folder are used.
 */
export function BacklinkedSessionsProvider({ children }: { children: ReactNode }) {
  const { send, subscribe } = useBridge();
  const queryClient = useQueryClient();
  const { activity } = useSessionActivity();
  const listed = useSessionContextOrNull()?.sessions;

  // How many places name each session; a session nobody names is not read.
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(() => new Map());
  const register = useCallback((ref: string) => {
    if (ref === '') return () => undefined;
    setCounts((prev) => new Map(prev).set(ref, (prev.get(ref) ?? 0) + 1));
    return () => {
      setCounts((prev) => {
        const next = new Map(prev);
        const left = (next.get(ref) ?? 0) - 1;
        if (left > 0) next.set(ref, left);
        else next.delete(ref);
        return next;
      });
    };
  }, []);

  const refs = useMemo(() => [...counts.keys()], [counts]);
  const desktopRefs = useMemo(() => refs.filter((ref) => ref.startsWith('local_')), [refs]);

  const reads = useQueries({
    queries: desktopRefs.map((id) => ({
      queryKey: [DESKTOP_SESSION_KEY, id],
      staleTime: DESKTOP_SESSION_STALE_MS,
      queryFn: () => readDesktopSession(send, id),
    })),
  });
  const readsKey = reads.map((read) => read.dataUpdatedAt).join(',');
  const desktopRecords = useMemo(() => {
    const byRef = new Map<string, DesktopSession | undefined>();
    desktopRefs.forEach((id, index) => byRef.set(id, reads[index]?.data ?? undefined));
    return byRef;
    // The reads are a new array each render; what changed is told by when each was last filled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktopRefs, readsKey]);

  // A session was renamed, archived or moved anywhere: what was read of the desktop sessions is read again, once the burst settles.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribe(MessageType.SESSIONS_UPDATED, () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: [DESKTOP_SESSION_KEY] });
        setExistTick((tick) => tick + 1);
      }, REFRESH_AFTER_MS);
    });
    return () => {
      unsubscribe();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [subscribe, queryClient]);

  // What a session is doing moved: what the desktop app records of it (waiting for the person, archived) moved with it.
  const lastActivity = useRef<Record<string, SessionActivity>>({});
  useEffect(() => {
    for (const id of desktopRefs) {
      const cli = desktopRecords.get(id)?.cliSessionId;
      if (!cli) continue;
      const now = activityOf(activity, cli);
      const before = lastActivity.current[cli];
      lastActivity.current[cli] = now;
      if (before !== undefined && before !== now) void queryClient.invalidateQueries({ queryKey: [DESKTOP_SESSION_KEY, id] });
    }
  }, [activity, desktopRefs, desktopRecords, queryClient]);

  // The sessions whose transcript is gone (deleted), asked for again when the sessions' lists move.
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  const [existTick, setExistTick] = useState(0);
  const workingDirectory = useWorkingDirOrNull()?.workingDirectory ?? '';

  const sessions = useMemo<Backlinks>(() => {
    const listedById = new Map((listed ?? []).map((row) => [row.id, row]));
    const map = new Map<string, BacklinkedSession>();
    // A place that names a session by its CLI id gets what the desktop app records of the same session.
    const desktopByCli = new Map<string, DesktopSession>();
    for (const record of desktopRecords.values()) if (record?.cliSessionId) desktopByCli.set(record.cliSessionId, record);
    for (const ref of refs) {
      const desktop = ref.startsWith('local_') ? desktopRecords.get(ref) : desktopByCli.get(ref);
      const cliSessionId = ref.startsWith('local_') ? desktop?.cliSessionId : ref;
      const row = cliSessionId ? listedById.get(cliSessionId) : undefined;
      const record: BacklinkedSession = {
        ref,
        ...(cliSessionId && { cliSessionId }),
        ...((desktop?.title ?? (row && (row.fullTitle || row.title))) && { title: desktop?.title ?? (row?.fullTitle || row?.title) }),
        ...((desktop?.cwd ?? row?.sessionDir) && { cwd: desktop?.cwd ?? row?.sessionDir }),
        ...(archivedOf(desktop?.isArchived, row?.sessionMark) !== undefined && { isArchived: archivedOf(desktop?.isArchived, row?.sessionMark) }),
        ...(desktop?.awaitingPerson !== undefined && { awaitingPerson: desktop.awaitingPerson }),
        ...(desktop?.lastActivityAt !== undefined && { lastActivityAt: desktop.lastActivityAt }),
        ...(((cliSessionId && missing.has(cliSessionId)) || desktop?.deleted === true) && { missing: true }),
        activity: cliSessionId ? activityOf(activity, cliSessionId) : SessionActivity.Idle,
      };
      map.set(ref, record);
      // A place that names the session by its CLI id finds the same record.
      if (cliSessionId && cliSessionId !== ref && !map.has(cliSessionId)) map.set(cliSessionId, record);
    }
    return map;
  }, [refs, desktopRecords, listed, activity, missing]);

  // What the sessions the transcript points at are doing is kept by the backend whoever runs them (a session woken
  // by the session-management MCP, one in the desktop app), and is told to every screen: running while it works,
  // unread once it has answered and until the person looks. It is told which ones to look at, and each one's folder.
  const watched = useMemo(() => {
    const byId = new Map<string, string>();
    for (const record of sessions.values()) {
      if (record.cliSessionId) byId.set(record.cliSessionId, record.cwd ?? workingDirectory);
    }
    return [...byId.entries()].filter(([, dir]) => dir !== '').sort(([a], [b]) => (a < b ? -1 : 1));
  }, [sessions, workingDirectory]);
  const watchedKey = JSON.stringify(watched);

  useEffect(() => {
    const timer = setTimeout(() => {
      const list = JSON.parse(watchedKey) as Array<[string, string]>;
      void send(MessageType.WATCH_SESSIONS, { sessions: list.map(([sessionId, dir]) => ({ sessionId, workingDir: dir })) }).catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [watchedKey, send]);

  // And which of them were deleted: asked for each folder, and again when the lists move.
  useEffect(() => {
    const list = JSON.parse(watchedKey) as Array<[string, string]>;
    if (list.length === 0) {
      setMissing((prev) => (prev.size === 0 ? prev : new Set()));
      return;
    }
    let cancelled = false;
    const byDir = new Map<string, string[]>();
    for (const [id, dir] of list) byDir.set(dir, [...(byDir.get(dir) ?? []), id]);
    void Promise.all(
      [...byDir.entries()].map(async ([dir, ids]) => {
        const answer = await send<{ missing?: string[] }>(MessageType.GET_SESSIONS_EXIST, { sessionIds: ids, workingDir: dir }).catch(() => undefined);
        return { ids, missing: answer?.missing, asked: answer !== undefined };
      }),
    ).then((answers) => {
      if (cancelled) return;
      const next = new Set<string>();
      for (const answer of answers) for (const id of answer.missing ?? []) next.add(id);
      setMissing((prev) => (prev.size === next.size && [...next].every((id) => prev.has(id)) ? prev : next));
    });
    return () => {
      cancelled = true;
    };
  }, [watchedKey, existTick, send]);

  const value = useMemo(() => ({ sessions, register }), [sessions, register]);
  return <BacklinkedSessionsContext.Provider value={value}>{children}</BacklinkedSessionsContext.Provider>;
}

/** Every session the transcript points at, as the one map the screens read; undefined outside a chat. */
export function useBacklinkedSessions(): Backlinks | undefined {
  return useContext(BacklinkedSessionsContext)?.sessions;
}

/**
 * What the chat knows of one session its transcript points at, by the id the transcript names it by (Desktop's
 * `local_…` or the CLI's), or undefined while that is not known. Naming a session here is what has it read and
 * kept current. `enabled: false` names nothing (a place that has no session to point at yet).
 *
 * Outside a chat (no provider) the desktop app's own record is read for this place alone, so the place still works.
 */
export function useBacklinkedSession(ref: string, enabled: boolean = true): BacklinkedSession | undefined {
  const context = useContext(BacklinkedSessionsContext);
  const wanted = enabled && ref !== '' ? ref : '';

  const register = context?.register;
  useEffect(() => (wanted !== '' && register ? register(wanted) : undefined), [wanted, register]);

  // No provider: the record is made of what this place can read itself.
  const alone = useDesktopSession(wanted, context === null && wanted !== '');
  const { activity } = useSessionActivity(context === null && wanted !== '');
  const aloneCli = wanted.startsWith('local_') ? alone?.cliSessionId : wanted;

  return useMemo(() => {
    if (wanted === '') return undefined;
    if (context) return context.sessions.get(wanted);
    if (!alone && !aloneCli) return undefined;
    return {
      ref: wanted,
      ...(aloneCli && { cliSessionId: aloneCli }),
      ...(alone?.title && { title: alone.title }),
      ...(alone?.cwd && { cwd: alone.cwd }),
      ...(alone?.isArchived !== undefined && { isArchived: alone.isArchived }),
      ...(alone?.awaitingPerson !== undefined && { awaitingPerson: alone.awaitingPerson }),
      ...(alone?.lastActivityAt !== undefined && { lastActivityAt: alone.lastActivityAt }),
      ...(alone?.deleted === true && { missing: true }),
      activity: aloneCli ? activityOf(activity, aloneCli) : SessionActivity.Idle,
    } satisfies BacklinkedSession;
  }, [context, wanted, alone, aloneCli, activity]);
}
