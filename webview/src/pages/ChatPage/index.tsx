import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import { ChatInput } from './ChatInput';
import { SessionHeader } from './SessionHeader';
import { ChatMessageArea } from './ChatMessageArea';
import { PermissionBanner } from './PermissionBanner';
import { AskUserQuestionInputPanel } from './AskUserQuestionInputPanel';
import { AcceptPlanPanel } from './AcceptPlanPanel';
import { BannerArea } from './BannerArea';
import { UpdateBanner } from './UpdateBanner';
import { ConnectionLostBanner } from './ConnectionLostBanner';
import { AuthErrorBanner } from './AuthErrorBanner';
import { BrowserPermissionBanner } from './BrowserPermissionBanner';
import { BackgroundTasksPanel } from './BackgroundTasksPanel';
import { ScheduledMessagesPanel, ScheduledMessageEditOverlay } from './ScheduledMessagesPanel';
import { McpModal } from '@/components/McpModal';
import { AnnouncementTopBannerSlot, AnnouncementModalSlot } from '@/components/Announcements/placements';
import { OPEN_MCP_MODAL_EVENT } from '@/commandPalette/sections/customize/items';
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
import { useNotificationSound } from '@/notifications';
import { useSettings } from '@/contexts/SettingsContext';
import { SettingKey } from '@/types/settings';
import { clampAutoScrollThreshold, nextAutoFollow, shouldShowScrollToBottom, AUTO_SCROLL_THRESHOLD_DEFAULT, AUTO_SCROLL_BOTTOM_EPS } from '@/utils/autoScroll';
import { useApi } from '../../contexts/ApiContext';
import { mergeToolResults } from './mergeToolResults';
import { isOlderPagePrepend, findNewestUserUuid } from './paging';
import { useTranslation } from '@/i18n';

export function ChatPage() {
  const { t } = useTranslation('chat');
  // NOTE: no auth "gate" here. A failed/undetermined `auth status` must NOT bounce
  // the user to login (that caused #178's repeated reauth). A definitive logout
  // surfaces as the AuthErrorBanner below; only a real chat 401 auto-redirects.

  // pre-fetch: ChatPage 마운트 시 query를 활성화해 모달이 즉시 표시되도록
  useMcpServers();
  const queryClient = useQueryClient();
  const [mcpModalOpen, setMcpModalOpen] = useState(false);

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

  const api = useApi();
  const { textareaRef, focus: focusInput } = useChatInputFocus();
  const { currentSessionId, currentSession } = useSessionContext();
  const { messages, isStreaming, hasMoreOlder, oldestLoadedUuid } = useChatStreamContext();
  // Always on: receive due scheduled-message deliveries pushed to this tab and
  // send them through the normal composer path (independent of any limit banner).
  useScheduledDelivery();
  const { pending: pendingUserAnswer, dismiss } = usePendingAskUserQuestion(messages, isStreaming);
  const { pending: pendingPermission, approve: approvePermission, approveForSession, deny: denyPermission } = usePendingPermissions();
  const { pending: pendingPlan, approve: approvePlan, deny: denyPlan } = usePendingPlanApproval();
  const { selection: soundSelection } = useNotificationSound();
  const { settings } = useSettings();
  const autoScrollThreshold = clampAutoScrollThreshold(
    settings[SettingKey.AUTO_SCROLL_THRESHOLD] ?? AUTO_SCROLL_THRESHOLD_DEFAULT,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Scroll position & page tracking refs
  const isInitialScrollDoneRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingMoreRef = useRef(false);
  const hasMoreOlderRef = useRef(false);
  // Reactive mirror of isLoadingMoreRef so the "loading earlier" indicator updates
  // immediately (the ref alone can't drive a re-render → the indicator lagged).
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Refs for scroll anchoring during prepend paging
  const prevScrollHeightRef = useRef(0);
  const prevOldestUuidRef = useRef<string | null>(null);

  // Refs to read fast-changing states inside requestAnimationFrame loop without re-registering it
  const messagesRef = useRef(messages);
  const isStreamingRef = useRef(isStreaming);
  const currentSessionIdRef = useRef(currentSessionId);
  const hasMessagesRef = useRef(false);

  useEffect(() => {
    messagesRef.current = messages;
    isStreamingRef.current = isStreaming;
    currentSessionIdRef.current = currentSessionId;
    hasMessagesRef.current = messages.length > 0;
  }, [messages, isStreaming, currentSessionId]);

  // Auto-follow tracks user *intent*, not viewport position.
  const autoFollowRef = useRef(true);
  const prevScrollTopRef = useRef(0);
  const lastScrollHeightRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // uuid of the newest user message we last re-armed auto-follow for, so a
  // fresh send is detected even after the user scrolled auto-follow off.
  const lastFollowedUserUuidRef = useRef<string | null>(null);

  useEffect(() => {
    hasMoreOlderRef.current = hasMoreOlder;
  }, [hasMoreOlder]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  // Track session change
  useEffect(() => {
    isInitialScrollDoneRef.current = false;
    autoFollowRef.current = true;
    prevOldestUuidRef.current = null;
    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
  }, [currentSessionId]);

  // Re-arm auto-follow whenever a new user message is sent, even if the user had
  // scrolled up and turned auto-follow off. Detected via the newest User-typed
  // message's uuid changing (not "last array element is user" — a non-streaming
  // send also appends an assistant placeholder after it). This effect only
  // writes refs, so it never triggers an extra render.
  useEffect(() => {
    const uuid = findNewestUserUuid(messages);
    if (uuid && uuid !== lastFollowedUserUuidRef.current) {
      lastFollowedUserUuidRef.current = uuid;
      autoFollowRef.current = true;
    }
  }, [messages]);

  const mergedMessages = useMemo(() => mergeToolResults(messages), [messages]);

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

  // Drive auto-follow and scroll positioning from requestAnimationFrame
  useEffect(() => {
    let rafId = 0;
    const tick = () => {
      const el = scrollContainerRef.current;
      if (el) {
        const msgs = messagesRef.current;
        const sid = currentSessionIdRef.current;

        // 1. Initial scroll positioning (instant)
        if (!isInitialScrollDoneRef.current && msgs.length > 0 && el.scrollHeight > 0) {
          const key = `claude-gui:scroll:${sid}`;
          const cached = localStorage.getItem(key);
          if (cached) {
            const top = Number(cached);
            el.scrollTop = top;
            localStorage.removeItem(key);
            const cachedDist = el.scrollHeight - top - el.clientHeight;
            autoFollowRef.current = cachedDist <= autoScrollThreshold;
          } else {
            // Default: instant scroll to bottom
            el.scrollTop = el.scrollHeight;
            autoFollowRef.current = true;
          }
          isInitialScrollDoneRef.current = true;
          prevScrollTopRef.current = el.scrollTop;
          lastScrollHeightRef.current = el.scrollHeight;
        } else {
          // 2. Normal auto-scroll follow
          const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
          const delta = el.scrollTop - prevScrollTopRef.current;
          const next = nextAutoFollow(autoFollowRef.current, delta, dist, autoScrollThreshold);
          autoFollowRef.current = next;

          const show = shouldShowScrollToBottom(next, hasMessagesRef.current, dist, autoScrollThreshold);
          setShowScrollButton(prev => (prev === show ? prev : show));

          const grew = el.scrollHeight !== lastScrollHeightRef.current;
          if (next && grew && dist > AUTO_SCROLL_BOTTOM_EPS) {
            // Smooth scroll during streaming, instant otherwise
            el.scrollTo({ 
              top: el.scrollHeight, 
              behavior: isStreamingRef.current ? 'smooth' : 'auto' 
            });
          }
          lastScrollHeightRef.current = el.scrollHeight;
          prevScrollTopRef.current = el.scrollTop;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [autoScrollThreshold]);

  const scrollToBottom = useCallback(() => {
    const marker = document.getElementById('scroll-bottom-marker');
    if (!marker) return;
    marker.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useAwaitingNotifications(currentSession?.title ?? null, soundSelection, {
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
    if (currentSessionId) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        localStorage.setItem(`claude-gui:scroll:${currentSessionId}`, String(el.scrollTop));
      }, 300);
    }

    // 2. Prefetch the next page ~one viewport BEFORE the top, so older messages
    //    are already in place by the time the user scrolls up — smooth, no wall.
    const prefetchMargin = Math.max(400, el.clientHeight);
    if (el.scrollTop < prefetchMargin && hasMoreOlderRef.current && oldestLoadedUuid && !isLoadingMoreRef.current) {
      loadMore();
    }
  }, [currentSessionId, oldestLoadedUuid, loadMore]);

  // 빈 영역 클릭 시 textarea로 포커스 이동
  // mousedown 시점에 확인해야 포커스 이동 전 activeElement를 비교할 수 있음
  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, textarea, select, [role="button"], [contenteditable]')) {
      return;
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
      {/* Header - Minimal */}
      <div className="fixed w-full top-0 bg-blend-darken bg-surface-base z-30">
        <SessionHeader />
      </div>

      <BannerArea>
        <UpdateBanner />
        <ConnectionLostBanner />
        <AuthErrorBanner />
        <BrowserPermissionBanner />
        <AnnouncementTopBannerSlot />
      </BannerArea>

      {/* Messages Area */}
      <div ref={scrollContainerRef} onScroll={handleScroll} className="flex flex-col flex-1 overflow-y-auto w-full h-screen pt-10 pb-0 bg-surface-base z-0">
        <ChatMessageArea
          isStreaming={isStreaming && !pendingUserAnswer && !pendingPlan && !pendingPermission}
          mergedMessages={mergedMessages}
          hasMore={hasMoreOlder}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
        />

        <div id="scroll-bottom-marker" />

        {/* Input Area */}
        <div className="sticky w-full start-0 bottom-0 z-10">
          {showScrollButton && (
              <button
                  onClick={scrollToBottom}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 flex items-center gap-1.5 px-3 py-1.5 bg-surface-raised border border-border-default rounded-full shadow-md text-xs text-text-primary hover:bg-surface-hover transition-colors"
              >
                <ChevronDownIcon className="w-3.5 h-3.5" />
                {t('chatPage.scrollToBottom')}
              </button>
          )}
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
              />
          ) : (
              <ChatInput />
          )}
        </div>
      </div>

      <BackgroundTasksPanel />
      <ScheduledMessagesPanel />
      <ScheduledMessageEditOverlay />
      {mcpModalOpen && <McpModal onClose={() => setMcpModalOpen(false)} />}
      <AnnouncementModalSlot />
    </div>
  );
}
