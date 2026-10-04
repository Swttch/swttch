import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { DictationProvider } from './ChatInput/DictationProvider';
import { ListeningNotice } from './ListeningNotice';
import { SessionHeader } from './SessionHeader';
import { ChatMessageArea } from './ChatMessageArea';
import { PermissionBanner } from './PermissionBanner';
import { AskUserQuestionInputPanel } from './AskUserQuestionInputPanel';
import { AcceptPlanPanel } from './AcceptPlanPanel';
import { BannerArea } from './BannerArea';
import { MigrationBanner } from './MigrationBanner';
import { UpdateBanner } from './UpdateBanner';
import { ConnectionLostBanner } from './ConnectionLostBanner';
import { AuthErrorBanner } from './AuthErrorBanner';
import { BrowserPermissionBanner } from './BrowserPermissionBanner';
import { BackgroundTasksPanel } from './BackgroundTasksPanel';
import { ScheduledMessagesPanel, ScheduledMessageEditOverlay } from './ScheduledMessagesPanel';
import { McpModal } from '@/components/McpModal';
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
import { useChatInputFocus } from '../../contexts/ChatInputFocusContext';
import { useChatStreamContext } from '../../contexts/ChatStreamContext';
import { useScheduledDelivery } from '../../hooks/useScheduledDelivery/useScheduledDelivery';
import { useSessionContext } from '../../contexts/SessionContext';
import { useAwaitingNotifications } from '../../hooks';
import { usePendingAskUserQuestion } from '../../hooks/usePendingAskUserQuestion';
import { usePendingPermissions } from '../../hooks/usePendingPermissions';
import { usePendingPlanApproval } from '../../hooks/usePendingPlanApproval';
import { useChatAutoScroll } from './useChatAutoScroll';
import { useApi } from '../../contexts/ApiContext';
import { mergeToolResults } from './mergeToolResults';
import { mergeSplitThinkingMessages } from './mergeSplitThinkingMessages';
import { restoreQueuedMessages } from './restoreQueuedMessages';
import { isOlderPagePrepend } from './paging';
import { useTranslation } from '@/i18n';
import { AutoResumeProvider } from '@/contexts/AutoResumeContext';
import { useOnboarding } from '@/contexts/OnboardingContext';
import { ChatInput } from './ChatInput';
import { AccountSwitchErrorBanner } from './AccountSwitchErrorBanner';
import { SendIndex, SEND_INDEX_RAIL_WIDTH } from './SendIndex';
import { carriedSend } from './SendIndex/carriedSend';
import { useSessionSends } from '@/hooks/useSessionSends';
import type { SessionSend } from '@/shared';
import { groupIntoSendSections } from './groupIntoSendSections';

/** Stable empty list, so a session with no index yet does not re-render everything each time. */
const EMPTY_SENDS: SessionSend[] = [];

export function ChatPage() {
  return (
    <AutoResumeProvider>
      {/* Outside ChatPageContent so a recording survives the composer being
          swapped out for an approval prompt — see the note on the provider. */}
      <DictationProvider>
        <ChatPageContent />
      </DictationProvider>
    </AutoResumeProvider>
  );
}

function ChatPageContent() {
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
  const { textareaRef, focus: focusInput } = useChatInputFocus();
  const { currentSessionId, currentSession } = useSessionContext();
  const { messages, isStreaming, disconnectCountdown, apiRetry, hasMoreOlder, oldestLoadedUuid } = useChatStreamContext();
  // Always on: receive due scheduled-message deliveries pushed to this tab and
  // send them through the normal composer path (independent of any limit banner).
  useScheduledDelivery();
  const { pending: pendingUserAnswer, dismiss } = usePendingAskUserQuestion(messages, isStreaming);
  const { pending: pendingPermission, approve: approvePermission, approveForSession, deny: denyPermission } = usePendingPermissions();
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

  // Auto-follow, the "Scroll to bottom" button's visibility and the remembered
  // position; see useChatAutoScroll.
  const {
    scrollRef: scrollContainerRef,
    showScrollButton,
    rememberScrollPosition,
    prevScrollTopRef,
    lastScrollHeightRef,
  } = useChatAutoScroll(currentSessionId, messages, isStreaming);

  // Page tracking refs
  const isLoadingMoreRef = useRef(false);
  const hasMoreOlderRef = useRef(false);
  // Reactive mirror of isLoadingMoreRef so the "loading earlier" indicator updates
  // immediately (the ref alone can't drive a re-render → the indicator lagged).
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Refs for scroll anchoring during prepend paging
  const prevScrollHeightRef = useRef(0);
  const prevOldestUuidRef = useRef<string | null>(null);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);

  // Track session change (paging state; useAutoScroll resets its own)
  useEffect(() => {
    prevOldestUuidRef.current = null;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
  }, [currentSessionId]);

  // restoreQueuedMessages runs first: it turns the CLI's queue bookkeeping back
  // into the user messages it never wrote to the session file, so mergeToolResults
  // sees the same shape it would for any other conversation. mergeSplitThinkingMessages
  // rejoins a thinking stretch one response wrote as two session entries (#496).
  const mergedMessages = useMemo(
    () => mergeToolResults(mergeSplitThinkingMessages(restoreQueuedMessages(messages))),
    [messages],
  );

  // One split, read by both the transcript and the send index. See the
  // `sections` prop on ChatMessageArea for why it is not computed there.
  const sections = useMemo(() => groupIntoSendSections(mergedMessages), [mergedMessages]);

  /*
    Every send in the session, which two surfaces need: the rail draws a tick
    per send, and the transcript uses it to fill the header above a page that
    opens mid-reply. Fetched once here rather than by each of them, so they
    cannot end up describing two different sessions.
  */
  const sessionSends = useSessionSends(true) ?? EMPTY_SENDS;
  const carried = useMemo(() => carriedSend(sections, sessionSends), [sections, sessionSends]);


  // Scroll preservation on older-page prepend.
  //
  // Anchoring is keyed purely on oldestLoadedUuid changing to a different non-null
  // value — i.e. an actual older-page prepend. Streaming deltas grow the newest
  // messages and leave oldestLoadedUuid untouched, so they never enter the
  // anchoring branch (a streaming delta doing so is what made the viewport jump).
  // The loading guard is intentionally neither read nor cleared here; its lifecycle
  // is owned by the loadOlder promise (see loadMore), so a mid-request streaming
  // delta can no longer release it early.
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || !currentSessionId) return;

    const prepended = isOlderPagePrepend(prevOldestUuidRef.current, oldestLoadedUuid);
    if (prepended) {
      // Older messages were prepended, adjust scroll position to prevent jumping
      const newScrollHeight = el.scrollHeight;
      const heightDiff = newScrollHeight - prevScrollHeightRef.current;
      el.scrollTop = prevScrollTopRef.current + heightDiff;

      // Sync scroll baselines
      prevScrollTopRef.current = el.scrollTop;
      lastScrollHeightRef.current = el.scrollHeight;
    }

    prevScrollHeightRef.current = el.scrollHeight;
    prevOldestUuidRef.current = oldestLoadedUuid;
  }, [messages, oldestLoadedUuid, currentSessionId]);

  const scrollToBottom = useCallback(() => {
    const marker = document.getElementById('scroll-bottom-marker');
    if (!marker) return;
    marker.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useAwaitingNotifications(currentSession?.title ?? null, {
    pendingPermission: pendingPermission !== null,
    pendingPlanApproval: pendingPlan !== null,
    pendingUserAnswer: pendingUserAnswer !== null,
  });

  const loadMore = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasMoreOlderRef.current || !oldestLoadedUuid || isLoadingMoreRef.current || !currentSessionId) return;

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    prevScrollHeightRef.current = el.scrollHeight;
    prevScrollTopRef.current = el.scrollTop;

    // The loading guard is closed by the request's own lifecycle, not a wall-clock
    // guess: loadOlder resolves on the backend ACK (the handler sends SESSION_LOADED
    // then ACK). The .finally() clears the guard for every outcome — a normal page,
    // an empty page, an all-duplicate page, or an error — so paging can neither get
    // permanently stuck nor fire a duplicate request with the same cursor while one
    // is still in flight.
    api.sessions.loadOlder(currentSessionId, oldestLoadedUuid)
      .catch(err => {
        console.error('[ChatPage] Failed to load older messages:', err);
      })
      .finally(() => {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  }, [currentSessionId, oldestLoadedUuid, api.sessions]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    // 1. Debounced save scroll position to localStorage
    rememberScrollPosition();

    // 2. Prefetch the next page ~one viewport BEFORE the top, so older messages
    //    are already in place by the time the user scrolls up — smooth, no wall.
    const prefetchMargin = Math.max(400, el.clientHeight);
    if (el.scrollTop < prefetchMargin && hasMoreOlderRef.current && oldestLoadedUuid && !isLoadingMoreRef.current) {
      loadMore();
    }
  }, [rememberScrollPosition, oldestLoadedUuid, loadMore]);

  // 빈 영역 클릭 시 textarea로 포커스 이동
  // mousedown 시점에 확인해야 포커스 이동 전 activeElement를 비교할 수 있음
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    /*
     * Read the composed path, not `e.target`.
     *
     * The review diff draws its editable side inside a shadow root, and the
     * platform retargets `e.target` to the host element — `<diffs-container>`,
     * which matches none of the selectors below. So a click meant to put the
     * caret in a proposed edit read as a click on empty space: this handler
     * called preventDefault and moved focus to the composer, and the proposed
     * side could never be typed into. `closest()` cannot see past a shadow
     * boundary; the path holds the real element.
     *
     * Same fix, same reason as isTypingTarget in useApprovalKeyboard — that one
     * was for keystrokes leaking into the approval panel, this one for the click
     * that should have focused the editor in the first place.
     */
    const path = typeof e.nativeEvent.composedPath === 'function'
      ? e.nativeEvent.composedPath()
      : [e.target];
    const CONTROLS = 'button, a, input, textarea, select, [role="button"], [contenteditable]';
    for (const node of path) {
      if (!(node instanceof HTMLElement)) continue;
      if (node.matches(CONTROLS)) return;
    }
    if (document.activeElement === textareaRef.current) {
      // 이미 포커스 상태 → 브라우저가 포커스를 빼앗지 못하게 방지
      // e.preventDefault();
      return;
    }
    e.preventDefault();
    focusInput();
  }, [textareaRef, focusInput]);

  return (
    <div className="flex flex-col w-full h-full bg-surface-base text-text-primary fixed start-0 top-0" onMouseDown={handleContainerMouseDown}>
      {/*
        Header - Minimal

        `h-10` is load-bearing, not cosmetic: it must equal the scroll
        container's `pt-10` below, which reserves the space this fixed header
        covers. Left to size itself from its contents the header came out at
        34px, and the 6px shortfall showed up as a sliver of scrolled content
        above the sticky user message (issue #274).
      */}
      <div className="fixed w-full top-0 bg-blend-darken bg-surface-base z-30 h-10">
        <SessionHeader isAwaitingUser={isAwaitingUser} />
      </div>

      <BannerArea>
        <MigrationBanner />
        <UpdateBanner />
        <ConnectionLostBanner />
        <AuthErrorBanner />
        <BrowserPermissionBanner />
        <AccountSwitchErrorBanner />
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

        `paddingInlineEnd` is what keeps the ticks beside the transcript instead
        of on top of it. It is read from the rail's own constant so the two
        cannot drift; see SEND_INDEX_RAIL_WIDTH.
      */}
      <SendIndex sections={sections} sessionSends={sessionSends} />
      <div
        ref={scrollContainerRef}
        data-chat-scroll
        onScroll={handleScroll}
        style={{ paddingInlineEnd: SEND_INDEX_RAIL_WIDTH }}
        className="flex flex-col flex-1 overflow-y-auto w-full h-screen pt-10 pb-0 bg-surface-base z-0"
      >
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
        />

        <div id="scroll-bottom-marker" />

        {/* Input Area */}
        {/* Named so a collapsed review can sit clear of it: the review is drawn
            in a portal and cannot see this from where it is, so it measures it.
            See CHAT_FOOTER_ID. */}
        {/* Never taller than the chat area. A prompt panel pinned here grows
            upward, and nothing can scroll back to what went past the top, its
            collapse button first of all. Capping the footer at the scroll
            container lets each panel shrink its own middle and scroll there,
            with no height worked out by hand, at any zoom or window size. */}
        <div id={CHAT_FOOTER_ID} className="sticky w-full start-0 bottom-0 z-10 flex flex-col max-h-full">
          {showScrollButton && (
              <button
                  onClick={scrollToBottom}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border-default rounded-full shadow-md text-xs text-text-primary hover:bg-surface-hover transition-colors"
              >
                <ChevronDownIcon className="w-3.5 h-3.5" />
                {t('chatPage.scrollToBottom')}
              </button>
          )}
          {composerReplaced && <ListeningNotice />}
          {pendingUserAnswer ? (
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
              <PermissionBanner
                  permission={pendingPermission}
                  onApprove={() => approvePermission(pendingPermission.controlRequestId)}
                  onApproveForSession={() => approveForSession(pendingPermission.controlRequestId)}
                  onDeny={(reason) => denyPermission(pendingPermission.controlRequestId, reason)}
                  onOpenDiffOverlay={setDiffOverlayToolUseId}
              />
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
  );
}
