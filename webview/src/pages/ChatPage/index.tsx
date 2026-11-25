import { useOptionalWorkflowState } from '@/contexts/WorkflowStateContext';
import { withLiveTaskNotices } from './liveTaskNotices';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { DictationProvider } from './ChatInput/DictationProvider';
import { ListeningNotice } from './ListeningNotice';
import { SessionHeader } from './SessionHeader';
import { useDesktopTabActions } from './useDesktopTabActions';
import { ChatMessageArea } from './ChatMessageArea';
import { TranscriptArea } from './transcript/TranscriptArea';
import { useTranscriptViewMode } from './message-renderers/transcriptViewMode';
import type { ChatSearchSource } from './chatSearch/useChatSearch';
import { PermissionBanner } from './PermissionBanner';
import { REPLIED_IN_CHAT_ANSWER, repliedInChatAnswers } from './AskUserQuestionInputPanel/repliedInChat';
import { usesDesktopPermissionCard } from './PermissionBanner/DesktopPermissionCard';
import { AskUserQuestionInputPanel } from './AskUserQuestionInputPanel';
import { AcceptPlanPanel } from './AcceptPlanPanel';
import { PendingPlanContext } from './AcceptPlanPanel/PendingPlanContext';
import { PendingQuestionContext } from './AskUserQuestionInputPanel/PendingQuestionContext';
import { BannerArea } from './BannerArea';
import { SettingsFileProblemBanner } from './SettingsFileProblemBanner';
import { MigrationBanner } from './MigrationBanner';
import { UpdateBanner } from './UpdateBanner';
import { ConnectionLostBanner } from './ConnectionLostBanner';
import { AuthErrorBanner } from './AuthErrorBanner';
import { BrowserPermissionBanner } from './BrowserPermissionBanner';
import { BackgroundTasksPanel } from './BackgroundTasksPanel';
import { useTaskPanelColumn, useTaskPanelWidthCss } from './BackgroundTasksPanel/useTaskPanelColumn';
import { FilePreviewPane } from '@/components/FilePreviewPane';
import { usePaneColumn, usePaneWidth } from '@/components/FilePreviewPane/usePaneColumn';
import { ScheduledMessagesPanel, ScheduledMessageEditOverlay } from './ScheduledMessagesPanel';
import { McpModal } from '@/components/McpModal';
import { SideQuestionModal } from '@/components/SideQuestionModal';
import { SessionRail } from './SessionRail';
import { DiffOverlay } from '../DiffPage/DiffOverlay';
import { CHAT_FOOTER_ID } from './chatFooter';
import { AnnouncementTopBannerSlot, AnnouncementModalSlot } from '@/components/Announcements/placements';
import { WhatsNewSlot } from '@/components/WhatsNewModal/WhatsNewSlot';
import { OPEN_MCP_MODAL_EVENT } from '@/commandPalette/sections/customize/items';
import {
  OPEN_PROMPT_LIBRARY_EVENT,
  type OpenPromptLibraryDetail,
} from '@/commandPalette/sections/context/items';
import { PromptLibraryModal } from '@/components/PromptLibraryModal';
import { useMcpServers, MCP_SERVERS_QUERY_KEY } from '@/hooks/useMcpServers';
import { useQueryClient } from '@tanstack/react-query';
import { MissingFolderBar } from './MissingFolderBar';
import { ArchivedChatInputSlot } from './ArchivedSessionBar';
import { HeldElsewhereInputSlot } from './HeldElsewhereBar';
import { useSessionHeldElsewhere } from '@/hooks/useSessionHeldElsewhere';
import { isArchivedMark } from '@/components/SessionList/archive';
import { useWorkingDirGone } from '@/hooks/useWorkingDirGone';
import { useChatStreamContext } from '../../contexts/ChatStreamContext';
import { useScheduledDelivery } from '../../hooks/useScheduledDelivery/useScheduledDelivery';
import { useSessionContext } from '../../contexts/SessionContext';
import { useAwaitingNotifications, useDocumentTitle } from '../../hooks';
import { useMarkSessionRead } from '../../hooks/useMarkSessionRead';
import { useReportPanelVisibility } from '../../hooks/useReportPanelVisibility';
import { useReportSessionActivity } from '../../hooks/useReportSessionActivity';
import { useTopBar } from '../../contexts/TopBarContext';
import { usePendingAskUserQuestion } from '../../hooks/usePendingAskUserQuestion';
import { usePendingPermissions } from '../../hooks/usePendingPermissions';
import { usePendingPlanApproval } from '../../hooks/usePendingPlanApproval';
import { useChatAutoScroll } from './useChatAutoScroll';
import { useApi } from '../../contexts/ApiContext';
import { mergeToolResults } from './mergeToolResults';
import { reuseSections } from './reuseSections';
import type { SendSection } from './groupIntoSendSections';
import { mergeSplitThinkingMessages } from './mergeSplitThinkingMessages';
import { restoreQueuedMessages } from './restoreQueuedMessages';
import { hideCliNotes } from './hideCliNotes';
import { placeCompactCommand } from './placeCompactCommand';
import { splitSectionsAtGap } from './windowGapSections';
import { ENTRY_UUID_ATTRIBUTE, useScrollAnchor } from './useScrollAnchor';
import { useChatWindowConfig } from '@/hooks/useChatWindowConfig';
import { firstUuidOf, nextStep } from '@/utils/transcriptWindow';
import { useTranslation } from '@/i18n';
import { AutoResumeProvider } from '@/contexts/AutoResumeContext';
import { BacklinkedSessionsProvider } from '@/contexts/BacklinkedSessionsContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { ChatInput } from './ChatInput';
import { AccountSwitchErrorBanner } from './AccountSwitchErrorBanner';
import { SendIndex, SEND_INDEX_RAIL_WIDTH } from './SendIndex';
import { ChatFollowContext } from './ChatFollowContext';
import { carriedSend } from './SendIndex/carriedSend';
import { useSessionSends } from '@/hooks/useSessionSends';
import type { SessionSend } from '@/shared';

/** Stable empty list, so a session with no index yet does not re-render everything each time. */
const EMPTY_SENDS: SessionSend[] = [];

/** How long the window is left alone after a page came or went, while what was drawn settles to its height. */
const WINDOW_SETTLE_MS = 600;

export function ChatPage() {
  return (
    <AutoResumeProvider>
      {/* Outside ChatPageContent so a recording survives the composer being
          swapped out for an approval prompt — see the note on the provider. */}
      <DictationProvider>
        <BacklinkedSessionsProvider>
          <ChatPageContent />
        </BacklinkedSessionsProvider>
      </DictationProvider>
    </AutoResumeProvider>
  );
}

function ChatPageContent() {
  useDesktopTabActions();
  const { t } = useTranslation('chat');
  // NOTE: no auth "gate" here. A failed/undetermined `auth status` must NOT bounce
  // the user to login (that caused #178's repeated reauth). A definitive logout
  // surfaces as the AuthErrorBanner below; only a real chat 401 auto-redirects.

  // pre-fetch: ChatPage 마운트 시 query를 활성화해 모달이 즉시 표시되도록
  useMcpServers();
  const queryClient = useQueryClient();
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  // Which screen the prompt library opens on, or null while it is closed.
  /**
   * How the prompt library should open, or null while it is closed.
   *
   * More than a screen name because the `!!` panel can ask for one prompt's
   * edit screen: the panel knows which prompt, the library owns the editor.
   */
  const [promptLibraryOpen, setPromptLibraryOpen] = useState<OpenPromptLibraryDetail | null>(null);
  // The review being shown over this screen, when the settings ask for an
  // overlay rather than a tab. Null the rest of the time, which is every host
  // that opens a window of its own — there the review is not this screen's to
  // hold. Carries the tool call rather than the change: the page fetches that
  // itself, exactly as it does in a tab.
  const [diffOverlayToolUseId, setDiffOverlayToolUseId] = useState<string | null>(null);

  useEffect(() => {
    const handler = () => {
      // 모달 오픈 시 캐시 invalidate → 최신 상태 보장
      void queryClient.invalidateQueries({ queryKey: MCP_SERVERS_QUERY_KEY });
      setMcpModalOpen(true);
    };
    window.addEventListener(OPEN_MCP_MODAL_EVENT, handler);
    return () => window.removeEventListener(OPEN_MCP_MODAL_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The prompt library is opened from the palette's Context section and from the
  // `!!` panel, which asks for the create screen from its last row and for one
  // prompt's edit screen from a row's pencil.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<OpenPromptLibraryDetail>).detail;
      setPromptLibraryOpen({ view: detail?.view === 'create' ? 'create' : 'list', edit: detail?.edit });
    };
    window.addEventListener(OPEN_PROMPT_LIBRARY_EVENT, handler);
    return () => window.removeEventListener(OPEN_PROMPT_LIBRARY_EVENT, handler);
  }, []);

  const api = useApi();
  const onboarding = useOnboarding();
  const { currentSessionId, currentSession } = useSessionContext();
  // The archived bar takes the keyboard focus (on its new-session button) only when the session was archived while it
  // was open, however that came about, and not when an archived session is merely opened.
  const currentSessionArchived = isArchivedMark(currentSession?.sessionMark);
  const heldElsewhere = useSessionHeldElsewhere(currentSessionId);
  // `lastSeenArchived`: whether the open session's row said archived the last time the row was in the list; null before
  // the row was ever seen. Opening a session loads the list a moment later, and a row that arrives archived is an
  // archived session being opened, not one archived while open. A moment without the row (the list is read anew)
  // does not erase what was seen.
  const lastSeenRef = useRef<{ id: string | null; archived: boolean | null }>({ id: null, archived: null });
  const [archivedWhileOpenId, setArchivedWhileOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (lastSeenRef.current.id !== currentSessionId) lastSeenRef.current = { id: currentSessionId, archived: null };
    if (!currentSession) return;
    if (lastSeenRef.current.archived === false && currentSessionArchived && currentSessionId) {
      setArchivedWhileOpenId(currentSessionId);
    }
    lastSeenRef.current = { id: currentSessionId, archived: currentSessionArchived };
  }, [currentSessionId, currentSession, currentSessionArchived]);
  const archivedWhileOpen = currentSessionArchived && archivedWhileOpenId === currentSessionId;
  const { messages, isStreaming, error, disconnectCountdown, apiRetry, hasMoreOlder, oldestLoadedUuid, windowGap, windowState, dropWindowPage, releaseHeldMessages, restartTurnClock, markQuestionReplied } = useChatStreamContext();
  // null is the chat released so far; a named view mode draws the transcript with its own code.
  const transcriptViewMode = useTranscriptViewMode();
  // The send index sits on the start edge in the transcript view modes, where user messages are on the end side,
  // drawn over the chat; the classic chat keeps it on the end edge, in the strip the chat reserves there.
  const railAtStart = transcriptViewMode !== null;
  const { isTopBarDisplayed, topBarHeight } = useTopBar();
  const paneColumn = usePaneColumn();
  const paneColumnWidth = usePaneWidth(true);
  const taskPanelColumn = useTaskPanelColumn();
  const taskPanelWidth = useTaskPanelWidthCss();
  // The folder this session works in was deleted or moved. The CLI cannot start there, so
  // the input gives way to a bar offering another folder.
  const folderGone = useWorkingDirGone(error);
  // Always on: receive due scheduled-message deliveries pushed to this tab and
  // send them through the normal composer path (independent of any limit banner).
  useScheduledDelivery();
  const { pending: pendingUserAnswer, dismiss } = usePendingAskUserQuestion(messages, isStreaming);
  const { pending: pendingPermission, approve: approvePermission, approveForSession, approveAlways, deny: denyPermission } = usePendingPermissions();
  const { pending: pendingPlan, approve: approvePlan, deny: denyPlan } = usePendingPlanApproval();
  /**
   * The CLI has stopped and is waiting for this user to answer something.
   *
   * All three prompts mean the same thing to anything outside the chat: nothing
   * is running, and the next move is the user's. The tab icons say so from here
   * (issue #456) — `isStreaming` stays true through a prompt, because the turn
   * really has not ended, so it cannot answer this question on its own.
   */
  const isAwaitingUser = Boolean(pendingUserAnswer || pendingPlan || pendingPermission);
  const cardWaiting = Boolean(pendingPermission && usesDesktopPermissionCard(pendingPermission.toolName, transcriptViewMode));
  // A question or a plan waiting for its answer in the views that follow the desktop app says "Input needed" too.
  const answerCard = transcriptViewMode !== null && Boolean(pendingUserAnswer || pendingPlan);
  const inputNeeded = cardWaiting || answerCard;
  // What was written under the card goes out the moment the card is answered.
  // What was written under the card reaches the CLI before the card is answered, so the turn that goes on after
  // the answer already has it and answers it with the rest (the desktop app's order), not in a turn of its own.
  // An allow hands them to the CLI at the click but keeps drawing them where they are until the command has finished
  // (see TranscriptArea), so the CLI reads them with the command's result and answers once, as the desktop app does.
  // A denial ends the turn there, so they enter the chat with the answer.
  const answerAfterHeld = (answer: () => void, denied = false): Promise<void> => {
    return releaseHeldMessages(!denied).finally(() => {
      answer();
      // After a denial what follows is a new stretch of work: its time and tokens are counted from here, as the
      // desktop app does ("Thinking", then "3.8s · 46 tokens"). After an allow the same stretch goes on: the
      // desktop app's line says "36 tokens" straight after the click and "71 tokens" at the end.
      if (denied) restartTurnClock();
    });
  };
  /**
   * An approval prompt is standing in the composer's slot at the foot of the
   * chat, so the composer is unmounted right now.
   *
   * The same condition as above, under the name of what it does to this screen:
   * a prompt waiting for an answer is drawn where the composer would be. Two
   * things below read it that way — the slot itself, and the recording notice
   * that has to step in for the microphone button while the button is off
   * screen (issue #409).
   */
  const composerReplaced = isAwaitingUser;

  // What this page tells the world around it: the tab's title and icon, the
  // alert at the end of a turn, what the backend's session lists draw for this
  // session, and the mark that it has been looked at.
  //
  // They live here, not in the top bar, because they are the page's doing. They
  // used to sit in the bar only because the bar happens to be mounted for as
  // long as the chat is showing a session — and a page whose bar is hidden
  // (`top_bar_display=F`) must go on telling all four.
  useDocumentTitle(
    currentSession?.title || null,
    currentSessionId === null,
    isStreaming,
    error,
    isAwaitingUser,
  );
  // The session lists draw the same answer the favicon and the IDE tab draw
  // (issue #456).
  useReportSessionActivity(currentSessionId, isStreaming, isAwaitingUser);
  // A session nobody is looking at can have its CLI stopped until the next message.
  useReportPanelVisibility();
  // Looking at a session is what marks it read (issue #449).
  useMarkSessionRead(currentSessionId, isStreaming);

  // Auto-follow, the "Scroll to bottom" button's visibility and the remembered
  // position; see useChatAutoScroll.
  const {
    scrollRef: scrollContainerRef,
    showScrollButton,
    rememberScrollPosition,
    prevScrollTopRef,
    lastScrollHeightRef,
    autoFollowRef,
    // The follow's own way to the bottom: a glide in its frame loop (#701), or straight there when asked.
    scrollToBottom: followToBottom,
    releaseFollow,
  } = useChatAutoScroll(currentSessionId, messages, isStreaming);

  // Page tracking refs. One request for a page is in flight at a time, whichever side of the
  // transcript it is for; `loadingPage` says which, so the right indicator is drawn.
  const isLoadingMoreRef = useRef(false);
  const hasMoreOlderRef = useRef(false);
  // Reactive mirror of isLoadingMoreRef so the "loading earlier" indicator updates
  // immediately (the ref alone can't drive a re-render → the indicator lagged).
  const [loadingPage, setLoadingPage] = useState<'older' | 'gap' | null>(null);
  const isLoadingMore = loadingPage === 'older';
  const isLoadingGap = loadingPage === 'gap';

  // What the transcript window holds, and the place the reader is held at while it changes (#680).
  const windowConfig = useChatWindowConfig();
  const windowConfigRef = useRef(windowConfig);
  windowConfigRef.current = windowConfig;
  const windowStateRef = useRef(windowState);
  windowStateRef.current = windowState;
  const windowGapKey = windowGap ? `${windowGap.afterUuid}|${windowGap.beforeUuid}` : null;
  // The held messages, read at the moment of a question rather than closed over, and the index of each
  // by uuid, rebuilt only when they are not the ones it was built from.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const heldIndexRef = useRef<{ source: unknown; index: Map<string, number> } | null>(null);
  const heldIndexOf = useCallback((): Map<string, number> => {
    const source = messagesRef.current;
    if (heldIndexRef.current?.source !== source) {
      const index = new Map<string, number>();
      source.forEach((m, i) => { if (typeof m.uuid === 'string') index.set(m.uuid, i); });
      heldIndexRef.current = { source, index };
    }
    return heldIndexRef.current.index;
  }, []);
  const isHeldUuid = useCallback((uuid: string) => heldIndexOf().has(uuid), [heldIndexOf]);
  const { capture: captureScrollAnchor, restore: restoreScrollAnchor, forget: forgetScrollAnchor } = useScrollAnchor(scrollContainerRef, isHeldUuid);
  const prevOldestUuidRef = useRef<string | null>(null);
  const prevGapKeyRef = useRef<string | null>(null);
  // Set while a scroll to the bottom is on its way, so the pages it passes are not loaded for nothing.
  const scrollingToBottomRef = useRef(false);
  // Until when the window is left alone after it last changed (see reconcile).
  const windowSettlingUntilRef = useRef(0);
  const windowSettleTimerRef = useRef<number | null>(null);
  // The window is brought back in line with the reader's page by `reconcile`, defined further down; the
  // scroll to the bottom asks for one more pass when it is over.
  const reconcileRef = useRef<() => void>(() => {});
  // The last page asked for and when, so a page that adds nothing new is not asked for again at once.
  const lastRequestRef = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);

  // Track session change (paging state; useAutoScroll resets its own)
  useEffect(() => {
    prevOldestUuidRef.current = null;
    prevGapKeyRef.current = null;
    lastRequestRef.current = null;
    forgetScrollAnchor();
    windowSettlingUntilRef.current = 0;
    isLoadingMoreRef.current = false;
    setLoadingPage(null);
  }, [currentSessionId, forgetScrollAnchor]);

  // restoreQueuedMessages runs first: it turns the CLI's queue bookkeeping back
  // into the user messages it never wrote to the session file, so mergeToolResults
  // sees the same shape it would for any other conversation. mergeSplitThinkingMessages
  // rejoins a thinking stretch one response wrote as two session entries (#496).
  const workflowState = useOptionalWorkflowState();
  const liveEndedIds = workflowState?.liveEndedIds;
  const taskList = workflowState?.tasks;
  const mergedMessages = useMemo(() => {
    const merged = mergeToolResults(mergeSplitThinkingMessages(hideCliNotes(placeCompactCommand(restoreQueuedMessages(messages)))), {
      keepTaskNotices: transcriptViewMode !== null,
    });
    // The notice of a task whose end this screen saw, until the CLI's own is read back (next-gen view only).
    return transcriptViewMode !== null ? withLiveTaskNotices(merged, taskList ?? [], liveEndedIds) : merged;
  }, [messages, transcriptViewMode, taskList, liveEndedIds]);

  // One split, read by both the transcript and the send index. See the
  // `sections` prop on ChatMessageArea for why it is not computed there.
  const split = useMemo(
    () => splitSectionsAtGap(mergedMessages, messages, windowGap),
    [mergedMessages, messages, windowGap],
  );
  // The sections that did not change stay the objects they were, so that only the one a reply is streaming into
  // is drawn again for each word (#680).
  const drawnSectionsRef = useRef<SendSection[]>([]);
  const sections = useMemo(() => {
    const reused = reuseSections(drawnSectionsRef.current, split.sections);
    drawnSectionsRef.current = reused;
    return reused;
  }, [split.sections]);
  const { gapSectionIndex } = split;

  /*
    Every send in the session, which two surfaces need: the rail draws a tick
    per send, and the transcript uses it to fill the header above a page that
    opens mid-reply. Fetched once here rather than by each of them, so they
    cannot end up describing two different sessions.
  */
  const sessionSends = useSessionSends(true) ?? EMPTY_SENDS;
  const carried = useMemo(() => carriedSend(sections, sessionSends), [sections, sessionSends]);


  // Scroll preservation while the window changes.
  //
  // What the reader is looking at moves when entries are added or taken away above
  // it: an older page lands in front of everything, a trim lets go of the top, a page
  // filling the gap lands above the newest pages. Those are the moments the first
  // entry in view is the one held in place (see useScrollAnchor). Streaming deltas grow
  // the newest messages and change neither the oldest entry held nor the gap, so they
  // never enter this branch (a streaming delta doing so is what made the viewport jump).
  // The loading guard is intentionally neither read nor cleared here; its lifecycle
  // is owned by the request itself (see requestPage), so a mid-request streaming
  // delta can no longer release it early.
  //
  // The place to hold is noted again right here, while this is being rendered and the screen is
  // still the old one. The note taken at the last scroll event can be a frame old: a page that arrives
  // between a scroll and its event would otherwise move the reader back by what was scrolled since.
  // Only reads the screen, so rendering this twice does no harm.
  if (
    prevOldestUuidRef.current !== null &&
    (prevOldestUuidRef.current !== oldestLoadedUuid || prevGapKeyRef.current !== windowGapKey)
  ) {
    captureScrollAnchor();
  }

  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !currentSessionId) return;

    const hadSomethingHeld = prevOldestUuidRef.current !== null;
    const topMoved = hadSomethingHeld && prevOldestUuidRef.current !== oldestLoadedUuid;
    const gapMoved = hadSomethingHeld && prevGapKeyRef.current !== windowGapKey;
    if (topMoved || gapMoved) {
      windowSettlingUntilRef.current = Date.now() + WINDOW_SETTLE_MS;
      if (restoreScrollAnchor()) {
        // Sync scroll baselines
        prevScrollTopRef.current = el.scrollTop;
        lastScrollHeightRef.current = el.scrollHeight;
      }
    }

    prevOldestUuidRef.current = oldestLoadedUuid;
    prevGapKeyRef.current = windowGapKey;
    // The screen is now as the reader sees it: note the place for the next change.
    captureScrollAnchor();
  }, [messages, oldestLoadedUuid, windowGapKey, currentSessionId, restoreScrollAnchor, captureScrollAnchor, prevScrollTopRef, lastScrollHeightRef]);

  const scrollToBottom = useCallback(() => {
    // The newest pages are always held, so the way down never waits for the backend: the
    // pages the scroll passes on the way are not worth loading.
    scrollingToBottomRef.current = true;
    window.setTimeout(() => {
      scrollingToBottomRef.current = false;
      reconcileRef.current();
    }, 1200);
    // A jump, not a glide: a glide runs on screen over pages that are not held (a hole the recycler left, or
    // pages still being drawn) and stutters while they come in. The newest pages are held, so go straight there.
    // The follow is switched on again by the same call, so what streams in afterwards is followed (#701).
    followToBottom({ instant: true });
  }, [followToBottom]);

  useAwaitingNotifications(currentSession?.title ?? null, {
    pendingPermission: pendingPermission !== null,
    pendingPlanApproval: pendingPlan !== null,
    pendingUserAnswer: pendingUserAnswer !== null,
  });

  // Read at the moment of a request rather than closed over, because a request
  // can be made after waiting for another one to finish, and the cursor it
  // would then hold is the one from before that page arrived.
  const oldestLoadedUuidRef = useRef<string | null>(null);
  oldestLoadedUuidRef.current = oldestLoadedUuid;

  /**
   * Make one request for a page, or null when another is in flight (one at a time, whichever side
   * of the transcript it is for) or there is nothing to ask. The loading guard is closed by the
   * request's own lifecycle, not a wall-clock guess: it resolves on the backend ACK (the handler
   * sends SESSION_LOADED then ACK). The .finally() clears the guard for every outcome — a normal
   * page, an empty page, an all-duplicate page, or an error — so paging can neither get permanently
   * stuck nor fire a duplicate request with the same cursor while one is still in flight.
   */
  const requestPage = useCallback((kind: 'older' | 'gap', request: (sessionId: string) => Promise<void>): Promise<void> | null => {
    const el = scrollContainerRef.current;
    if (!el || isLoadingMoreRef.current || !currentSessionId) return null;

    isLoadingMoreRef.current = true;
    setLoadingPage(kind);
    // The screen as the reader has it, so that the page can be added without moving it.
    captureScrollAnchor();
    return request(currentSessionId).finally(() => {
      isLoadingMoreRef.current = false;
      setLoadingPage(null);
    });
  }, [currentSessionId, captureScrollAnchor]);

  /**
   * The button at the top of the transcript: ask for the page before the oldest one held. The window asks for
   * it on its own well before the reader gets there (see `reconcile`); this is for the reader who is there.
   */
  const loadMore = useCallback(() => {
    const cursor = oldestLoadedUuidRef.current;
    if (!hasMoreOlderRef.current || !cursor) return;
    requestPage('older', sessionId => api.sessions.loadOlder(sessionId, cursor))?.catch(err => {
      console.error('[ChatPage] Failed to load older messages:', err);
    });
  }, [requestPage, api.sessions]);

  // The find bar moves to a match that is not loaded: bring the page around its entry in, where the
  // history was. A scroll prefetch may already be running, so it is waited out first rather than
  // answered with a second request for the same page.
  const loadThrough = useCallback(async (uuid: string): Promise<void> => {
    for (let waited = 0; isLoadingMoreRef.current && waited < 100; waited++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await requestPage('older', sessionId => api.sessions.loadAround(sessionId, uuid));
  }, [requestPage, api.sessions]);

  // Which entries the transcript holds, asked about from outside the render.
  // The set is rebuilt only when the messages are not the ones it was built from.
  const loadedUuidsRef = useRef<{ source: unknown; uuids: Set<string> } | null>(null);
  const isEntryLoaded = useCallback((uuid: string): boolean => {
    const source = messagesRef.current;
    if (loadedUuidsRef.current?.source !== source) {
      const uuids = new Set<string>();
      for (const message of source) if (typeof message.uuid === 'string') uuids.add(message.uuid);
      loadedUuidsRef.current = { source, uuids };
    }
    return loadedUuidsRef.current.uuids.has(uuid);
  }, []);

  const findInChat = useMemo<ChatSearchSource>(() => ({
    sessionKey: currentSessionId,
    searchSession: (query: string) => {
      if (!currentSessionId) return Promise.reject(new Error('No session to search'));
      return api.sessions.search(currentSessionId, query);
    },
    isEntryLoaded,
    loadThrough,
    // The find bar moving the view to a match is the reader leaving the bottom.
    // The frame loop cannot be left to notice it: see `beforeJump`.
    beforeJump: () => {
      autoFollowRef.current = false;
    },
  }), [currentSessionId, api.sessions, isEntryLoaded, loadThrough, autoFollowRef]);

  /**
   * The indexes, among the held messages, of the first and the last entry on the screen. Both ends and
   * not the middle: a page can be much shorter than the screen, and the middle of the screen is then
   * well inside the stretch the reader sees, while the pages the window keeps have to reach past its edges.
   */
  const readerRange = useCallback((): { top: number; bottom: number } | null => {
    const el = scrollContainerRef.current;
    if (!el) return null;
    const view = el.getBoundingClientRect();
    // One screen more on each side: the gap, when there is one, is then always at least a screen away
    // from what the reader sees, however fast they scroll, and the page that is shown is never the last.
    const reach = el.clientHeight;
    // What is on the screen is the merged messages, and some of those were made out of others (a restored
    // queued message, say) and carry a uuid that none of the held entries has. Those say nothing about
    // where the reader is in what is held, so they are passed over.
    const heldIndex = heldIndexOf();
    let top = -1;
    let bottom = -1;
    for (const node of el.querySelectorAll<HTMLElement>(`[${ENTRY_UUID_ATTRIBUTE}]`)) {
      const rect = node.getBoundingClientRect();
      if (rect.bottom <= view.top - reach) continue;
      if (rect.top >= view.bottom + reach) break;
      const at = heldIndex.get(node.getAttribute(ENTRY_UUID_ATTRIBUTE) ?? '');
      if (at === undefined) continue;
      if (top === -1 || at < top) top = at;
      if (at > bottom) bottom = at;
    }
    return top === -1 ? null : { top, bottom };
  }, [scrollContainerRef, heldIndexOf]);

  /**
   * Bring what is held in line with the page the reader is on, one step at a time (#680): the newest pages
   * are always held, and around the reader's page the recycler holds as many pages above and below as the
   * settings say. What is out of its reach is dropped and what has come within it is loaded, and nothing
   * else decides: not which way the reader is scrolling, not how tall anything is on the screen.
   *
   * Asked after every scroll AND after every change to what is held, because the reader can be at the very
   * top with nothing left to scroll: a wheel turn there makes no scroll event, so nothing would ask again.
   * Nothing is dropped or asked for while a page is on its way: the cursor it was asked for with names
   * entries that a drop could take away from under it.
   */
  const reconcile = useCallback(() => {
    if (!scrollContainerRef.current || !currentSessionId || isLoadingMoreRef.current) return;
    // Entries just drawn are not at their final height yet (a long reply is folded a frame after it lands, so
    // the entries above the reader shrink by hundreds of pixels), and the reader's range measured on them
    // is off by whole pages: a page loaded for it was dropped again for the range measured a frame later,
    // and loaded once more. Decide on the screen as it settles into.
    const settlingFor = windowSettlingUntilRef.current - Date.now();
    if (settlingFor > 0) {
      if (windowSettleTimerRef.current === null) {
        windowSettleTimerRef.current = window.setTimeout(() => {
          windowSettleTimerRef.current = null;
          reconcileRef.current();
        }, settlingFor + 20);
      }
      return;
    }
    const range = readerRange();
    if (range === null) return;
    const state = windowStateRef.current;
    const config = windowConfigRef.current;
    let step = nextStep(messagesRef.current, state, config, range.top, range.bottom);
    if (step.kind === 'none' && config.recycle === false) {
      // The way the chat loaded before the window: the next older page is asked for once the reader is within
      // a screen (at least 400px) of the top, and nothing is ever dropped.
      const el = scrollContainerRef.current;
      const oldest = firstUuidOf(messagesRef.current);
      if (el && state.hasOlder && oldest !== null && el.scrollTop < Math.max(400, el.clientHeight)) {
        step = { kind: 'loadOlder', beforeUuid: oldest };
      }
    }
    if (step.kind === 'none') return;
    if (step.kind === 'drop') {
      captureScrollAnchor();
      dropWindowPage(step.start, config);
      return;
    }
    if (scrollingToBottomRef.current) return;

    // The same page asked for again within a moment means the last answer changed nothing.
    const key = step.kind === 'loadNewer' ? `n${step.afterUuid}` : `o${step.beforeUuid}`;
    const last = lastRequestRef.current;
    const now = Date.now();
    if (last && last.key === key && now - last.at < 400) return;
    lastRequestRef.current = { key, at: now };

    const failed = (err: unknown) => console.error('[ChatPage] Failed to load a page:', err);
    if (step.kind === 'loadOlder') {
      requestPage('older', sessionId => api.sessions.loadOlder(sessionId, step.beforeUuid))?.catch(failed);
    } else if (step.kind === 'loadNewer') {
      requestPage('gap', sessionId => api.sessions.loadNewer(sessionId, step.afterUuid, state.gap?.beforeUuid))?.catch(failed);
    } else {
      requestPage('gap', sessionId => api.sessions.loadOlder(sessionId, step.beforeUuid, state.gap?.afterUuid))?.catch(failed);
    }
  }, [currentSessionId, readerRange, captureScrollAnchor, dropWindowPage, requestPage, api.sessions, scrollContainerRef]);
  reconcileRef.current = reconcile;

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // 1. Debounced save scroll position to localStorage
    rememberScrollPosition();

    // 2. The reader may be on another page now.
    reconcile();

    // 3. Note the entry in view, so a page added above it does not move the reader (see useScrollAnchor).
    captureScrollAnchor();
  }, [rememberScrollPosition, reconcile, captureScrollAnchor]);

  // After the held messages change, or a request ends, ask again: the page that just arrived may not
  // have been enough, and no scroll event is coming to say so.
  useEffect(() => {
    reconcile();
  }, [messages, windowState, loadingPage, windowConfig, reconcile]);

  // No mousedown handler on this container on purpose (#513): cancelling the
  // default of a mousedown stops the browser from starting a word or drag
  // selection anywhere in the chat.
  return (
    /* A jump to a send (the send index, a pinned send's button) stops the follow before it starts (#701). */
    <ChatFollowContext.Provider value={releaseFollow}>
    {/* While the preview pane is a column, the chat is narrowed to what is left of the window. The
        transform makes the chat the frame its fixed header is placed in, so the header narrows with it. */}
    <div
      data-app-frame
      className="flex flex-col w-full h-full bg-surface-base text-text-primary fixed start-0 top-0"
      style={
        paneColumn
          ? { width: `calc(100% - ${paneColumnWidth} - 1rem)`, transform: 'translateZ(0)' }
          : taskPanelColumn
            ? { width: `calc(100% - ${taskPanelWidth})`, transform: 'translateZ(0)' }
            : undefined
      }
    >
      {/*
        Header - Minimal

        The height is load-bearing, not cosmetic: it must equal the scroll
        container's top padding below, which reserves the space this fixed
        header covers. Both read `topBarHeight`, so they cannot differ — and
        both go to zero together when the bar is hidden (`top_bar_display=F`).
        Left to size itself from its contents the header came out at 34px, and
        the 6px shortfall showed up as a sliver of scrolled content above the
        sticky user message (issue #274).
      */}
      {isTopBarDisplayed && (
        <div className="fixed w-full top-0 bg-blend-darken bg-surface-base z-30" style={{ height: topBarHeight }}>
          <SessionHeader />
        </div>
      )}

      <BannerArea>
        <MigrationBanner />
        <UpdateBanner />
        <ConnectionLostBanner />
        <AuthErrorBanner />
        <BrowserPermissionBanner />
        <AccountSwitchErrorBanner />
        <SettingsFileProblemBanner />
        <AnnouncementTopBannerSlot />
      </BannerArea>

      {/* Messages Area */}
      {/*
        `data-chat-scroll` is how a pinned send finds this element to measure
        its fold against (see useScrollFold). A class selector would do until
        someone restyles the container; the attribute says out loud that
        something depends on it.
      */}
      {/*
        The send index is a sibling of the scroll container rather than a child
        of it, so it can hold the vertical middle of the viewport while the
        transcript moves. Inside, it would scroll away with the content it is
        describing.

        In the classic chat `paddingInlineEnd` is what keeps the ticks beside the
        transcript instead of on top of it, read from the rail's own constant so
        the two cannot drift; see SEND_INDEX_RAIL_WIDTH. In the transcript view
        modes the rail is on the start edge, drawn over the chat, and nothing is
        reserved: every block there carries its own side padding.
      */}
      <SendIndex sections={sections} sessionSends={sessionSends} side={railAtStart ? 'start' : 'end'} />
      <div
        ref={scrollContainerRef}
        data-chat-scroll
        onScroll={handleScroll}
        style={{
          paddingInlineEnd: railAtStart ? undefined : SEND_INDEX_RAIL_WIDTH,
          paddingTop: topBarHeight,
          // How wide the chat column and the input may grow, and the side padding they take from the `sm` width up.
          // The transcript view modes use a wider column than the classic chat's 44rem; everything that sets a column
          // width reads these and falls back to its own.
          ...(railAtStart ? ({ '--chat-column-max': '70rem', '--chat-column-px': '2rem' } as React.CSSProperties) : {}),
        }}
        className="flex flex-col flex-1 overflow-y-auto w-full h-screen pb-0 bg-surface-base z-0"
      >
        {transcriptViewMode === null ? (
          <ChatMessageArea
            isStreaming={isStreaming && !isAwaitingUser}
            disconnectCountdown={disconnectCountdown}
            apiRetry={apiRetry}
            mergedMessages={mergedMessages}
            sections={sections}
            carriedSend={carried}
            hasMore={hasMoreOlder}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            gapSectionIndex={gapSectionIndex}
            isLoadingGap={isLoadingGap}
            findInChat={findInChat}
          />
        ) : (
          <PendingPlanContext.Provider value={answerCard && pendingPlan ? { pending: pendingPlan, onApprove: approvePlan, onDeny: denyPlan } : null}>
          <PendingQuestionContext.Provider value={answerCard && pendingUserAnswer ? { toolUse: pendingUserAnswer.toolUse, controlRequestId: pendingUserAnswer.controlRequestId, onDismiss: () => dismiss(pendingUserAnswer.toolUse.id) } : null}>
          <TranscriptArea
            isStreaming={isStreaming && !isAwaitingUser}
            awaitingInput={cardWaiting || answerCard}
            awaitingInputLine={answerCard ? 'none' : 'before'}
            trailing={
              cardWaiting && pendingPermission ? (
                <PermissionBanner
                  permission={pendingPermission}
                  onApprove={() => answerAfterHeld(() => approvePermission(pendingPermission.controlRequestId))}
                  onApproveForSession={() => answerAfterHeld(() => approveForSession(pendingPermission.controlRequestId))}
                  onApproveAlways={() => answerAfterHeld(() => approveAlways(pendingPermission.controlRequestId))}
                  onDeny={(reason) => answerAfterHeld(() => denyPermission(pendingPermission.controlRequestId, reason), true)}
                  onOpenDiffOverlay={setDiffOverlayToolUseId}
                />
              ) : null
            }
            disconnectCountdown={disconnectCountdown}
            apiRetry={apiRetry}
            mergedMessages={mergedMessages}
            sections={sections}
            carriedSend={carried}
            hasMore={hasMoreOlder}
            isLoadingMore={isLoadingMore}
            onLoadMore={loadMore}
            gapSectionIndex={gapSectionIndex}
            isLoadingGap={isLoadingGap}
            findInChat={findInChat}
          />
          </PendingQuestionContext.Provider>
          </PendingPlanContext.Provider>
        )}

        {/* Input Area */}
        {/* Named so a collapsed review can sit clear of it: the review is drawn
            in a portal and cannot see this from where it is, so it measures it.
            See CHAT_FOOTER_ID. */}
        {/* Never taller than the chat area. A prompt panel pinned here grows
            upward, and nothing can scroll back to what went past the top, its
            collapse button first of all. Capping the footer at the scroll
            container lets each panel shrink its own middle and scroll there,
            with no height worked out by hand, at any zoom or window size. */}
        {/* It stays in here so the transcript runs on behind it and shows around
            it. What it must not do is give up the room the container reserves
            for the send index: the end margin takes that room back, and the
            strip, stretched across the container, ends up centred instead of
            sitting a rail's width off to the start side. No `w-full`: a fixed
            width would hold the strip at the padded width and ignore the margin. */}
        <div
          id={CHAT_FOOTER_ID}
          className="sticky start-0 bottom-0 z-10 flex flex-col max-h-full"
          style={railAtStart ? undefined : { marginInlineEnd: -SEND_INDEX_RAIL_WIDTH }}
        >
          {showScrollButton && (
              <button
                  onClick={scrollToBottom}
                  data-testid={inputNeeded ? 'scroll-to-input-needed' : undefined}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border-default rounded-full shadow-md text-xs text-text-primary hover:bg-surface-hover transition-colors"
              >
                {/* While a desktop-style card waits for an answer, the pill says so, as the desktop app does. */}
                {inputNeeded && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                {inputNeeded ? t('chatPage.inputNeeded') : t('chatPage.scrollToBottom')}
                <ChevronDownIcon className="w-3.5 h-3.5" />
              </button>
          )}
          {composerReplaced && <ListeningNotice />}
          {currentSessionId && heldElsewhere ? (
              /* Another backend runs this session's CLI: whatever card is up (a question, a permission), what is typed
                 here would have to cross to that backend, and when it cannot be reached nothing crosses. The bar offers
                 taking the session over, ahead of every card, so that no state leaves the person without it. A question
                 card is in the conversation above and stays answerable there (the answer is handed to that backend). */
              <HeldElsewhereInputSlot sessionId={currentSessionId}>
                <ChatInput />
              </HeldElsewhereInputSlot>
          ) : answerCard ? (
              /* The card is part of the conversation above, after the last message, and the composer stays (#673). */
              <div>
                <ChatInput
                  cardWaiting
                  onQuestionReplied={
                    pendingUserAnswer
                      ? () => {
                          // A message typed under a question card is the answer to it, as in the desktop app: the CLI is
                          // told that the person did not answer in the card but sent a message instead.
                          // The working line carries the time from this moment, before the CLI has said anything.
                          markQuestionReplied();
                          if (pendingUserAnswer.controlRequestId) {
                            api.tools.respond(pendingUserAnswer.toolUse.id, REPLIED_IN_CHAT_ANSWER, {
                              controlRequestId: pendingUserAnswer.controlRequestId,
                              updatedInput: {
                                questions: pendingUserAnswer.toolUse.input.questions,
                                answers: repliedInChatAnswers(pendingUserAnswer.toolUse.input.questions),
                              },
                            });
                          }
                          dismiss(pendingUserAnswer.toolUse.id);
                        }
                      : undefined
                  }
                />
              </div>
          ) : pendingUserAnswer ? (
              <AskUserQuestionInputPanel
                  toolUse={pendingUserAnswer.toolUse}
                  controlRequestId={pendingUserAnswer.controlRequestId}
                  onDismiss={() => dismiss(pendingUserAnswer.toolUse.id)}
              />
          ) : pendingPlan ? (
              <AcceptPlanPanel
                  pending={pendingPlan}
                  onApprove={approvePlan}
                  onDeny={denyPlan}
              />
          ) : pendingPermission ? (
              cardWaiting ? (
                /* The card the desktop app draws is part of the conversation (above, after the last message)
                   and the composer stays where it is: what is typed there is an ordinary message and does not
                   answer the card (#673). */
                <div>
                  <ChatInput cardWaiting />
                </div>
              ) : (
                <PermissionBanner
                    permission={pendingPermission}
                    onApprove={() => approvePermission(pendingPermission.controlRequestId)}
                    onApproveForSession={() => approveForSession(pendingPermission.controlRequestId)}
                    onApproveAlways={() => approveAlways(pendingPermission.controlRequestId)}
                    onDeny={(reason) => denyPermission(pendingPermission.controlRequestId, reason)}
                    onOpenDiffOverlay={setDiffOverlayToolUseId}
                />
              )
          ) : folderGone ? (
              <MissingFolderBar />
          ) : currentSessionId && isArchivedMark(currentSession?.sessionMark) ? (
              <ArchivedChatInputSlot sessionId={currentSessionId} focusNewSession={archivedWhileOpen}>
                <ChatInput />
              </ArchivedChatInputSlot>
          ) : (
              /* The setup card is up, so there is nothing useful to type yet —
                 a prompt sent now would reach a CLI that is missing or signed
                 out. Dimmed and click-through rather than removed: the composer
                 staying in place is what says the chat is here and waiting,
                 where an empty gap would read as a broken screen.

                 The card itself stands in the empty state above, which is the
                 only screen it is ever raised on: it is shown once per install,
                 and a first run has no conversation to have scrolled past. */
              <div
                className={onboarding.visible ? 'pointer-events-none opacity-40' : undefined}
                aria-hidden={onboarding.visible || undefined}
              >
                <ChatInput />
              </div>
          )}
        </div>
      </div>

      <BackgroundTasksPanel />
      <SideQuestionModal />
      <SessionRail />
      <ScheduledMessagesPanel />
      <ScheduledMessageEditOverlay />
      {mcpModalOpen && <McpModal onClose={() => setMcpModalOpen(false)} />}
      {promptLibraryOpen !== null && (
        <PromptLibraryModal
          initialView={promptLibraryOpen.view ?? 'list'}
          initialEdit={promptLibraryOpen.edit}
          onClose={() => setPromptLibraryOpen(null)}
        />
      )}
      {/* Only while its question is still open: a prompt that has been answered
          — here, from the overlay itself, or anywhere else — takes the review
          with it, the same way closing the tab does on the other surfaces. */}
      {diffOverlayToolUseId && pendingPermission?.toolUseId === diffOverlayToolUseId && (
        <DiffOverlay
          toolUseId={diffOverlayToolUseId}
          onClose={() => setDiffOverlayToolUseId(null)}
        />
      )}
      <AnnouncementModalSlot />
      <WhatsNewSlot />
    </div>
    {/* A page, picture, PDF or video the chat named, beside the chat (#593) */}
    <FilePreviewPane />
    </ChatFollowContext.Provider>
  );
}
