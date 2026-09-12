import { useCallback, useEffect, useRef, KeyboardEvent, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent } from 'react';
import { CommandPalettePanel } from '@/commandPalette/ui/CommandPalettePanel';
import { useCommandPalette } from '@/commandPalette/hooks/useCommandPalette';
import { PanelSectionId, PanelItemType, CommandItem } from '@/types/commandPalette';
import { InputModeTag } from './InputModeTag';
import { ModeSelectPanel } from './ModeSelectPanel';
import { ScheduleSendPopover } from './ScheduleSendPopover';
import { ActionButtons } from './ActionButtons';
import { InputFrame } from './InputFrame';
import { MicButton } from './MicButton';
import { useDictationContext } from './DictationProvider';
import { useNavigateToLogin } from '@/hooks';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useChatInputFocus } from '../../../contexts/ChatInputFocusContext';
import { useInputHistory } from './hooks/useInputHistory';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { useBackgroundTaskActions } from '@/hooks/useBackgroundTaskActions';
import { EscapeStreak } from './hooks/escapeStreak';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { SessionState } from '@/types';
import { useAttachments } from './hooks/useAttachments';
import { clipboardCarriesImage } from './clipboardCarriesImage';
import { AttachmentPreview } from './AttachmentPreview';
import { ContextWindowTag } from './ContextWindowTag';
import { IdeSelectionTag } from './IdeSelectionTag';
import { ModelTag } from './ModelTag';
import { DragOverlay } from './DragOverlay';
import { AttachMenu } from './AttachMenu';
import { ModelSwitchOverlay, SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { EFFORT_CYCLE_EVENT } from '@/commandPalette/sections/model/EffortItem';
import { THINKING_TOGGLE_EVENT } from '@/commandPalette/sections/model/ThinkingItem';
import { OPEN_SESSION_DROPDOWN_EVENT, OPEN_SCHEDULE_SEND_EVENT } from '@/commandPalette/sections/context/items';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useSettings } from '@/contexts/SettingsContext';
import { displayShortcut } from '@/utils/shortcut';
import type { ScopedPrompt } from '@/types/prompt';
import { useEffort } from '@/hooks/useEffort';
import { useMention } from './hooks/useMention';
import { usePromptLibrary } from './hooks/usePromptLibrary';
import { usePromptVariableFill } from './hooks/usePromptVariableFill';
import { PromptVariablesModal } from '@/components/PromptVariablesModal';
import { useEditorContext } from '@/hooks/useEditorContext';
import { MentionDropdown } from './MentionDropdown';
import { PromptDropdown } from './PromptDropdown';
import {
  OPEN_PROMPT_LIBRARY_EVENT,
  INSERT_PROMPT_EVENT,
  type OpenPromptLibraryDetail,
  type InsertPromptDetail,
} from '@/commandPalette/sections/context/items';
import { replaceRangeWithText } from './RichInput/replaceRangeWithText';
import { isMobile, isBrowser } from '@/config/environment';
import { featureDocUrl } from '@/config/app';
import { shouldSubmitOnEnter } from './shouldSubmitOnEnter';
import { sendKeyLabel } from './sendKeyLabel';
import { arrowRecallsHistory } from './caretAtEdge';
import { basename } from './basename';
import { RichInput } from './RichInput';
import { useIMEComposition } from './RichInput/useIMEComposition';
import { insertNewlineAtCursor } from './RichInput/insertNewlineAtCursor';
import { TelemetryConsentBanner } from '../TelemetryConsentBanner';
import { InputBanner } from '../InputBanner';
import { AnnouncementInputBannerSlot } from '@/components/Announcements/placements';
import {
  useTelemetryConsent,
  ConsentStatus,
  ConsentSource,
  ConsentBannerAction,
} from '@/hooks/useTelemetryConsent';
import { getCaretOffset, setCaretOffset, CaretDirection } from '@/utils/domSelection';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

interface NativeDropEntry {
  path: string;
  type: 'file' | 'folder';
}

export function ChatInput() {
  const { t } = useTranslation('chat');
  // The library's own strings live in the common namespace, and the delete
  // question must read the same here as it does inside the library.
  const { t: tCommon } = useTranslation('common');
  const { textareaRef } = useChatInputFocus();
  const { currentSessionId, sessionState, workingDirectory, inputMode: mode, cycleInputMode: cycleMode, setInputMode, availableModes, autoFallbackNotice, dismissAutoFallback } = useSessionContext();
  const chatStream = useChatStreamContext();
  const { handleSubmit: onSubmit, isStreaming, stop: onStop } = chatStream;
  const { input: value, setInput: onChange } = useChatInputState();
  const inputHistory = useInputHistory({ workingDirectory, sessionId: currentSessionId });
  const { pushToHistory, navigateUp, navigateDown, resetHistory } = inputHistory;
  // The recording itself belongs to DictationProvider, which sits above this
  // component: a recording has to outlive the composer, because an approval
  // prompt takes this slot and unmounts it mid-sentence (issue #409). What is
  // left here is drawing the session — the button, the level, the interim text,
  // and the failure banner.
  const {
    dictation,
    startDictation,
    voiceEnabled,
    voiceShortcut,
    unavailable: dictationUnavailable,
    installKit,
    installingKit,
  } = useDictationContext();
  // Dictation can fail for want of a Claude account login, and the way to get
  // one is the login page the top auth banner already leads to.
  const navigateToLogin = useNavigateToLogin();
  const { confirmDialog, confirm } = useConfirmDialog();

  const bridge = useBridgeContext();
  const { subscribe } = bridge;
  const [isFocused, setIsFocused] = useState(false);
  // Known path tokens (e.g. `src/file.ts#L10-L25`) inserted via Alt+K /
  // EDITOR_CONTEXT, highlighted as chips in the composer. Reset on submit and
  // session switch (where `value` returns to '').
  const [pathTokens, setPathTokens] = useState<string[]>([]);

  const {
    attachments,
    addImageAttachment,
    addFileAttachment,
    addFolderAttachment,
    removeAttachment,
    clearAttachments,
    error: attachmentError,
    isDragOver,
    handlePaste,
    handleDrop,
    setIsDragOver,
  } = useAttachments();

  const {
    settings: claudeSettings,
    updateSetting: updateClaudeSetting,
  } = useClaudeSettings();
  // useCtrlEnterToSend + focusInputOnEditorContext migrated to the app settings.
  const { settings: appSettings } = useSettings();

  const { cycle: cycleEffort } = useEffort();
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModelSwitch, setShowModelSwitch] = useState(false);
  const [modelSwitchQuery, setModelSwitchQuery] = useState<string | null>(null);
  const [showModePanel, setShowModePanel] = useState(false);
  const modePanelRef = useRef<HTMLDivElement>(null);
  const [showSchedulePopover, setShowSchedulePopover] = useState(false);

  // 모드 선택 패널: 바깥 클릭 / Esc 로 닫는다.
  useEffect(() => {
    if (!showModePanel) return;
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (modePanelRef.current && !modePanelRef.current.contains(e.target as Node)) {
        setShowModePanel(false);
      }
    };
    const onEsc = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setShowModePanel(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [showModePanel]);
  // 텔레메트리 동의: profile 상태가 미응답(PENDING)일 때만 배너 노출. X 닫기는 이 세션에서만
  // 숨기고(consentDismissed), 새 세션 전환 시 다시 노출한다. 수락/거절하면 status가 바뀌어 영영 숨는다.
  const {
    status: consentStatus,
    accept: acceptConsent,
    deny: denyConsent,
    trackBanner: trackConsentBanner,
  } = useTelemetryConsent();
  const [consentDismissed, setConsentDismissed] = useState(false);
  // 배너를 띄울지는 이 한 줄에서만 정한다. 렌더와 노출 보고가 각자 조건을 들고 있으면
  // 한쪽만 고쳐졌을 때 "노출은 기록되는데 화면엔 없는" 상태로 조용히 갈라진다.
  const showConsentBanner = consentStatus === ConsentStatus.PENDING && !consentDismissed;

  // 노출 보고. 세션을 바꾸면 배너가 다시 떠 여러 번 발동하지만, 중복은 백엔드가 프로세스
  // 단위로 억제한다(동의율의 분모가 같은 설치의 반복으로 부풀지 않게).
  useEffect(() => {
    if (showConsentBanner) trackConsentBanner(ConsentBannerAction.SHOW);
  }, [showConsentBanner, trackConsentBanner]);

  // Native (IDE/Swing) drag-and-drop bridge: Kotlin → Node backend → IPC NATIVE_DROP_ENTRIES.
  // Currently unused (CefDragHandler forwards drops to the page as HTML5 events instead),
  // but kept as a fallback path for sources that don't surface paths in dataTransfer.
  useEffect(() => {
    return subscribe(MessageType.NATIVE_DROP_ENTRIES, (message) => {
      const entries = (message.payload?.entries as NativeDropEntry[] | undefined) ?? [];
      for (const entry of entries) {
        if (!entry.path) continue;
        if (entry.type === 'folder') {
          addFolderAttachment(entry.path, basename(entry.path));
        } else {
          addFileAttachment(entry.path, basename(entry.path));
        }
      }
    });
  }, [subscribe, addFileAttachment, addFolderAttachment]);

  // Catch native file drops anywhere in the JCEF surface, not just the chat input box.
  // The Kotlin CefDragHandler returns false so CEF forwards the drag as HTML5 events;
  // without window-level dragover/drop preventDefault, CEF's default action navigates
  // the tab to `file://...` (which the popup blocker rewrites to about:blank#blocked).
  // On drop we also fire NATIVE_DROP_FLUSH so the backend releases the OS paths that
  // CefDragHandler stashed at drag-enter — the page's dataTransfer can't carry them.
  useEffect(() => {
    const isFileDrag = (e: DragEvent) =>
      !!e.dataTransfer && (
        e.dataTransfer.types.includes('Files') ||
        e.dataTransfer.types.includes('text/uri-list')
      );
    const handleWindowDragOver = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      // Always reflect drag state on the composer chrome, even when the user hovers
      // over the message list or another non-input region of the panel.
      setIsDragOver(true);
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      // dragleave fires when leaving any child element too; relatedTarget=null is
      // the OS signal for the cursor actually leaving the window.
      if (!e.relatedTarget) setIsDragOver(false);
    };
    const handleWindowDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      setIsDragOver(false);
      // Image drops are handled here; file/folder paths are released by NATIVE_DROP_FLUSH.
      handleDrop(e as unknown as ReactDragEvent);
      void bridge.send(MessageType.NATIVE_DROP_FLUSH, {});
    };
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleDrop, bridge, setIsDragOver]);

  // 커맨드 팔레트 "Attach file..." 항목 연동
  useEffect(() => {
    const handleAttachFromPalette = () => {
      setShowAttachMenu(true);
    };
    window.addEventListener('command-palette:attach-files', handleAttachFromPalette);
    return () => window.removeEventListener('command-palette:attach-files', handleAttachFromPalette);
  }, []);

  // 커맨드 팔레트 "Schedule a message" 항목 연동: 예약 전송 팝오버를 연다.
  // 열기는 누구나 가능하고, 후원자 게이트는 팝오버 제출 시점에 걸린다.
  useEffect(() => {
    const handleOpenSchedule = () => setShowSchedulePopover(true);
    window.addEventListener(OPEN_SCHEDULE_SEND_EVENT, handleOpenSchedule);
    return () => window.removeEventListener(OPEN_SCHEDULE_SEND_EVENT, handleOpenSchedule);
  }, []);

  // 커맨드 팔레트 "Resume conversation" 항목 연동: 입력창의 `/resume` 텍스트를 비운다.
  // (드롭다운 열기·포커스는 SessionDropdown이 같은 이벤트를 수신해 처리한다.)
  useEffect(() => {
    const handleResumeFromPalette = () => onChange('');
    window.addEventListener(OPEN_SESSION_DROPDOWN_EVENT, handleResumeFromPalette);
    return () => window.removeEventListener(OPEN_SESSION_DROPDOWN_EVENT, handleResumeFromPalette);
  }, [onChange]);

  // 커맨드 팔레트 "Switch model..." 항목 + "/model [name]" 슬래시 연동.
  // "/model sonnet"은 detail.query로 이름을 실어 보내 오버레이가 즉시 전환한다.
  useEffect(() => {
    const handler = (e: Event) => {
      const query = (e as CustomEvent<{ query?: string }>).detail?.query;
      setModelSwitchQuery(typeof query === 'string' ? query : null);
      setShowModelSwitch(true);
    };
    window.addEventListener(SWITCH_MODEL_EVENT, handler);
    return () => window.removeEventListener(SWITCH_MODEL_EVENT, handler);
  }, []);

  // 커맨드 팔레트 "Effort" 항목 연동: 클릭 시 레벨 순환
  useEffect(() => {
    const handler = () => cycleEffort();
    window.addEventListener(EFFORT_CYCLE_EVENT, handler);
    return () => window.removeEventListener(EFFORT_CYCLE_EVENT, handler);
  }, [cycleEffort]);

  // 커맨드 팔레트 "Thinking" 항목 연동: 라벨 클릭 시 토글
  useEffect(() => {
    const handler = () => {
      const current = claudeSettings.alwaysThinkingEnabled ?? true;
      void updateClaudeSetting('alwaysThinkingEnabled', !current);
    };
    window.addEventListener(THINKING_TOGGLE_EVENT, handler);
    return () => window.removeEventListener(THINKING_TOGGLE_EVENT, handler);
  }, [claudeSettings.alwaysThinkingEnabled, updateClaudeSetting]);

  const disabled = sessionState === SessionState.Error || !workingDirectory;

  // IME composition truth (ref-only) shared between this keydown handler and the
  // RichInput editor. Under JCEF the native `isComposing` flag is unreliable.
  const ime = useIMEComposition();

  const palette = useCommandPalette({
    onChange,
    textareaRef,
    // A command picked mid-input is completed into the text rather than run
    // (issue #244), so put the caret back after the inserted name — the user is
    // still writing the sentence it belongs to.
    onCompleteInline: (_value, caretOffset) => {
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) setCaretOffset(el, caretOffset);
      });
    },
  });
  // Read through a ref inside onInsertMention: that callback outlives any single
  // render, and palette is recreated each one.
  const paletteRef = useRef(palette);
  paletteRef.current = palette;

  const mention = useMention({
    workingDirectory,
    value,
    onChange,
    inputRef: textareaRef,
    // @-mention selection inserts an inline path token (same chip set as Alt+K
    // editor-context inserts), then restores the caret just past the token.
    onInsertMention: (token, caretOffset, nextValue) => {
      setPathTokens(prev => (prev.includes(token) ? prev : [...prev, token]));
      // Picking a file settles the mention, so hand the shared slot back: a
      // "/command @file " line is a command again once the token is in
      // (issue #236). Without this the panel stays gone until the next keypress.
      paletteRef.current?.detectSlashCommand(nextValue, caretOffset);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) setCaretOffset(el, caretOffset);
      });
    },
  });

  // Every route that puts a saved prompt in the composer stops here first, so a
  // prompt holding `{{...}}` is answered before it is inserted rather than
  // landing as literal braces the user has to edit out.
  const variableFill = usePromptVariableFill();
  const { requestFill } = variableFill;

  const promptLibrary = usePromptLibrary({
    workingDirectory,
    value,
    onChange,
    inputRef: textareaRef,
    requestFill: variableFill.requestFill,
    // Pasting a saved prompt settles the `!!` token, so hand the shared slot
    // back the same way picking a mention does (issue #236): the pasted text may
    // itself end in a `/command` or an `@file` the other panels should answer.
    onPastePrompt: (caretOffset, nextValue) => {
      paletteRef.current?.detectSlashCommand(nextValue, caretOffset);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) setCaretOffset(el, caretOffset);
      });
    },
    // The last row of the `!!` panel opens the prompt library straight on its
    // create screen, so writing a prompt is one step from wanting one.
    onCreatePrompt: () => {
      window.dispatchEvent(
        new CustomEvent<OpenPromptLibraryDetail>(OPEN_PROMPT_LIBRARY_EVENT, {
          detail: { view: 'create' },
        }),
      );
    },
  });


  /**
   * Open the library on this prompt's edit screen.
   *
   * The panel closes first: the editor is a modal over the composer, and a
   * dropdown left hanging under it would outlive the token that opened it.
   */
  const editSavedPrompt = useCallback(
    (prompt: ScopedPrompt) => {
      promptLibrary.close();
      window.dispatchEvent(
        new CustomEvent<OpenPromptLibraryDetail>(OPEN_PROMPT_LIBRARY_EVENT, {
          detail: { view: 'list', edit: { scope: prompt.scope, prompt } },
        }),
      );
    },
    [promptLibrary],
  );

  /** Remove a prompt from the panel, after asking. Deleting cannot be undone. */
  const deleteSavedPrompt = useCallback(
    async (prompt: ScopedPrompt) => {
      const confirmed = await confirm({
        title: tCommon('promptLibrary.deleteTitle'),
        message: tCommon('promptLibrary.deleteMessage', { name: prompt.name }),
        confirmLabel: tCommon('promptLibrary.delete'),
        variant: 'danger',
      });
      if (!confirmed) return;
      await promptLibrary.deletePrompt(prompt);
    },
    [confirm, tCommon, promptLibrary],
  );

  // Backend pushes EDITOR_CONTEXT (the file the user is viewing + selection)
  // → insert `relativePath[#L..]` at the composer caret.
  // shouldFocus is controlled by the focusInputOnEditorContext user setting (default true).
  useEditorContext({
    value,
    onChange,
    textareaRef,
    currentWorkingDir: workingDirectory ?? '',
    shouldFocus: appSettings.focusInputOnEditorContext ?? true,
    onInsertToken: (token) =>
      setPathTokens(prev => (prev.includes(token) ? prev : [...prev, token])),
  });

  const handleCompact = useCallback(() => {
    const slashSection = palette.sections.find(s => s.id === PanelSectionId.SlashCommands);
    const compactItem = slashSection?.items.find(item => item.label === '/compact');
    if (compactItem?.type === PanelItemType.Command) {
      (compactItem as CommandItem).action();
    }
  }, [palette.sections]);

  // 커맨드 팔레트 "Mention file..." 항목 연동
  useEffect(() => {
    const handleMentionFromPalette = () => {
      // Defer to the next tick so that the palette closes before we insert @
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;

        onChange('@');
        mention.detectMention('@', 1);

        requestAnimationFrame(() => {
          el.focus();
          setCaretOffset(el, 1);
        });
      }, 0);
    };
    window.addEventListener('command-palette:mention-file', handleMentionFromPalette);
    return () => window.removeEventListener('command-palette:mention-file', handleMentionFromPalette);
  }, [onChange, mention, textareaRef]);

  // Focus on session change or when input becomes enabled
  useEffect(() => {
    if (!disabled) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [currentSessionId, disabled, textareaRef]);

  // Focus textarea when window/document gains focus.
  // Only restore focus when nothing else is already focused (activeElement is
  // body). The left session panel runs in a separate JCEF window; switching
  // between the two fires window 'focus' here repeatedly, and unconditionally
  // grabbing focus would let the editor tab keep stealing it back from the
  // panel — a focus ping-pong. Guarding on document.body keeps the
  // "return-to-IDE restores the input" intent without the tug-of-war.
  useEffect(() => {
    const handleFocus = () => {
      if (document.activeElement === document.body) {
        textareaRef.current?.focus();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [textareaRef]);

  // 세션 전환 시 ChatInput 로컬 상태 리셋
  const prevChatInputSessionRef = useRef(currentSessionId);
  useEffect(() => {
    const prev = prevChatInputSessionRef.current;
    prevChatInputSessionRef.current = currentSessionId;
    if (prev !== null && prev !== currentSessionId) {
      clearAttachments();
      setPathTokens([]);
      // The prompt history resets itself on the session change — it owns its own
      // fetch for the new session, so nothing to clear here.
      // 새 세션에서는 동의 배너를 다시 노출한다(미응답 상태인 경우).
      setConsentDismissed(false);
    }
  }, [currentSessionId, clearAttachments]);

  const isActive = isStreaming
    || sessionState === SessionState.WaitingPermission
    || sessionState === SessionState.HasDiff;

  const isInterruptible = isActive;

  // Counts the Escapes that follow an interrupt (issue #330). A ref, not state:
  // it must survive re-renders without causing any, and the keydown effect reads
  // it directly.
  const escapeStreak = useRef(new EscapeStreak());
  const { cancelAllRunning, runningCount } = useBackgroundTaskActions();

  // Escape ×3 on an idle chat offers to stop the background tasks the interrupt
  // left running. Nothing running means nothing to ask about, so the gesture
  // stays silent rather than opening a dialog with no subject.
  const confirmStopBackgroundTasks = useCallback(async () => {
    if (runningCount === 0) return;
    const ok = await confirm({
      title: t('backgroundTasks.stopAll.title'),
      message: t('backgroundTasks.stopAll.message', { count: runningCount }),
      confirmLabel: t('backgroundTasks.stopAll.confirm'),
      variant: 'danger',
    });
    if (ok) cancelAllRunning();
  }, [runningCount, confirm, cancelAllRunning, t]);

  // ESC key: interrupt streaming or active state. Suppressed while the
  // schedule-send popover is open — there Escape closes the popover instead of
  // interrupting the stream (the popover owns its own Escape handler).
  //
  // Escape also carries a second gesture: three more presses on an already-idle
  // chat ask about stopping the background tasks the interrupt deliberately left
  // running (issue #330). EscapeStreak owns that rule; see its note on why a
  // four-tap run is interrupt + three.
  useEffect(() => {
    const handleEscKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || showSchedulePopover) return;

      if (isInterruptible) {
        e.preventDefault();
        escapeStreak.current.press(true);
        onStop();
        // Re-focus textarea after interrupt
        setTimeout(() => textareaRef.current?.focus(), 50);
        return;
      }

      // Idle chat. Only take over the key once the streak completes, so a lone
      // Escape still reaches whatever else listens for it.
      if (escapeStreak.current.press(false)) {
        e.preventDefault();
        void confirmStopBackgroundTasks();
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [isInterruptible, onStop, textareaRef, showSchedulePopover, confirmStopBackgroundTasks]);

  // The prompt history is no longer built from the loaded transcript. It cannot
  // be: pagination hands the webview the newest 50 *entries*, and entries are
  // dominated by tool_result plumbing, so a resumed session's typed prompts are
  // almost entirely outside what `messages` holds. useInputHistory asks the
  // backend, which has the whole active chain, instead.

  // Abandon history navigation once the composer is empty again, so the next Up
  // starts from the most recent prompt rather than resuming mid-walk.
  useEffect(() => {
    if (value === '') resetHistory();
  }, [value, resetHistory]);

  // A prompt picked in the library modal lands at the END of whatever is already
  // in the composer, not at the caret: while the modal was open the composer had
  // no visible caret, so "where the caret was" is not a place the user chose.
  useEffect(() => {
    const handler = (e: Event) => {
      const content = (e as CustomEvent<InsertPromptDetail>).detail?.content;
      if (!content) return;

      // Placeholders are answered first; a prompt without any goes straight in.
      requestFill(content, (filled) => {
        const el = textareaRef.current;
        el?.focus();

        const currentValue = el?.textContent ?? value;
        const insertAt = currentValue.length;
        const nextValue = currentValue + filled;
        const caretOffset = insertAt + filled.length;

        const handledByBrowser = el
          ? replaceRangeWithText(el, insertAt, insertAt, filled)
          : false;
        if (!handledByBrowser) onChange(nextValue);

        requestAnimationFrame(() => {
          const target = textareaRef.current;
          if (target) setCaretOffset(target, caretOffset);
        });
        // The pasted text may itself end in a `/command` or an `@file`, so let
        // the panels that own those decide whether they belong on screen now.
        paletteRef.current?.detectSlashCommand(nextValue, caretOffset);
      });
    };
    window.addEventListener(INSERT_PROMPT_EVENT, handler);
    return () => window.removeEventListener(INSERT_PROMPT_EVENT, handler);
  }, [value, onChange, textareaRef, requestFill]);

  const handleRichChange = useCallback((newValue: string) => {
    onChange(newValue);
    // The caret decides which of the two dropdowns owns the slot above the
    // composer, so resolve it before either detector runs (issue #236).
    const caret = textareaRef.current ? getCaretOffset(textareaRef.current) : newValue.length;
    palette.detectSlashCommand(newValue, caret);
    mention.detectMention(newValue, caret);
    promptLibrary.detectPrompt(newValue, caret);
  }, [onChange, palette, mention, promptLibrary, textareaRef]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    // Feed the IME truth: keyCode 229 means the IME is still processing this
    // keystroke, so mark composition active before any Enter decision runs.
    ime.noteKeyDown(e.nativeEvent.keyCode);

    // 받아쓰기 토글은 여기서 처리하지 않는다. useGlobalShortcut이 window의
    // capture 단계에서 먼저 가로채므로, 포커스가 어디에 있든 동작한다.

    // Shift+Tab: 모드 전환
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      cycleMode();
      return;
    }

    // Cmd+Arrow is not handled here. useCaretBoundaryKeys claims it at the
    // window in the capture phase, for every text field in the app at once —
    // including this one, and including the history navigation below, which
    // reads a bare ArrowUp and must not see a Cmd+ArrowUp meaning "go to the
    // top of the text".

    // Prompt library interaction. First of the three because `!!` is the most
    // specific trigger, and because the render order below puts it first too —
    // #236 was caused by a keydown order that disagreed with the render order.
    if (promptLibrary.isActive && promptLibrary.handleKeyDown(e)) return;

    // Mention interaction (must precede slash command handling)
    if (mention.isActive && mention.handleKeyDown(e)) return;

    // Slash command interaction
    if (palette.handleSlashKeyDown(e, value)) return;

    // Enter: submit or newline depending on useCtrlEnterToSend setting.
    // IME composition and mobile guards always apply to the submit path.
    // Enter is double-detected (key OR keyCode 13) because non-English layouts
    // under JCEF can surface it with a non-"Enter" key string (issue #215).
    const isEnterKey = e.key === 'Enter' || e.nativeEvent.keyCode === 13;
    if (isEnterKey) {
      // Combine our composition truth with the native flag: either being set
      // means "in composition", since JCEF's native flag alone is unreliable.
      const isIMEComposing = ime.isComposing() || e.nativeEvent.isComposing;
      const willSubmit = shouldSubmitOnEnter(
        {
          key: e.key,
          keyCode: e.nativeEvent.keyCode,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          isComposing: isIMEComposing,
          isMobile: isMobile(),
        },
        appSettings.useCtrlEnterToSend ?? false,
      );
      if (willSubmit) {
        e.preventDefault();
        if (!disabled && (value.trim() || attachments.length > 0)) {
          pushToHistory(value);
          onSubmit(undefined, mode, attachments.length > 0 ? attachments : undefined);
          clearAttachments();
          setPathTokens([]);
        }
        return;
      }
      // Not a submit. Insert a newline explicitly (issue #215): under JCEF a
      // plain Enter in a non-English layout is otherwise swallowed as an IME
      // commit and no line break appears. While composing we do NOT touch it —
      // the composition confirmation owns that keystroke.
      if (!isIMEComposing) {
        e.preventDefault();
        insertNewlineAtCursor();
        const text = e.currentTarget.textContent ?? '';
        handleRichChange(text);
      }
      return;
    } else if (e.key === 'ArrowUp' && !palette.showSlashCommands) {
      // Moving comes first, and the history only gets the key once the caret has
      // nowhere left to go: Up walks up the visual rows, then from the top row to
      // the very first character, and only the press after that — one the
      // composer would not act on at all — recalls the previous prompt.
      //
      // This used to scan the text for "\n" instead, which is the mistake
      // utils/domSelection warns about: a soft-wrapped prompt is one run of text
      // with no newline in it, so every visual row read as "the first line" and
      // Up jumped to the previous prompt mid-paragraph.
      if (!arrowRecallsHistory(e, e.currentTarget, CaretDirection.Backward)) return;

      const historyValue = navigateUp(value);
      if (historyValue === null) return;
      e.preventDefault();
      onChange(historyValue);
      // Land on the character the walk continues from, so holding Up keeps
      // moving through prompts instead of re-crossing the one just recalled.
      requestAnimationFrame(() => {
        const target = textareaRef.current;
        if (target) setCaretOffset(target, 0);
      });
    } else if (e.key === 'ArrowDown' && !palette.showSlashCommands) {
      // The mirror of Up: the last character, not the last row.
      if (!arrowRecallsHistory(e, e.currentTarget, CaretDirection.Forward)) return;

      const historyValue = navigateDown();
      if (historyValue === null) return;
      e.preventDefault();
      onChange(historyValue);
      requestAnimationFrame(() => {
        const target = textareaRef.current;
        if (target) setCaretOffset(target, historyValue.length);
      });
    }
  }, [disabled, value, attachments.length, onSubmit, pushToHistory, navigateUp, navigateDown, onChange, palette, mention, promptLibrary, cycleMode, clearAttachments, mode, appSettings.useCtrlEnterToSend, ime, handleRichChange, textareaRef]);

  // Wrap the attachment paste handler so images keep their dedicated path while
  // text goes through the browser's own editing pipeline.
  //
  // Text is deliberately NOT intercepted (issue #286). Cancelling the paste and
  // writing the result through onChange used to strip formatting and keep
  // `value` authoritative, but it also meant the browser never recorded the
  // edit, so Cmd/Ctrl+Z could not undo a paste while text typed afterwards
  // undid normally. The editor is `contentEditable="plaintext-only"`, which
  // already drops rich markup on paste, so letting the default run costs us
  // nothing on formatting and restores undo. The resulting `input` event feeds
  // handleRichChange, which keeps `value` in sync and runs both detectors.
  const handleRichPaste = useCallback((e: ReactClipboardEvent<HTMLDivElement>) => {
    if (clipboardCarriesImage(e.clipboardData)) {
      // Delegate image handling (it calls preventDefault internally).
      handlePaste(e);
      return;
    }

    // Text falls through untouched: the default paste inserts it, records the
    // undo entry, and fires `input`, which handleRichChange picks up.
  }, [handlePaste]);

  const hasValue = !!value.trim() || attachments.length > 0;

  return (
    <div className="max-w-[44rem] mx-auto px-4 pb-[14px] pt-2">
      {/* 텔레메트리 동의 인풋배너: 미응답(PENDING)이고 이 세션에서 닫지 않았을 때만 표시 */}
      {showConsentBanner && (
        <TelemetryConsentBanner
          onAccept={() => void acceptConsent(ConsentSource.BANNER)}
          onDeny={() => void denyConsent(ConsentSource.BANNER)}
          onClose={() => {
            setConsentDismissed(true);
            trackConsentBanner(ConsentBannerAction.DISMISS);
          }}
        />
      )}
      {/* Auto mode 강등 안내: auto를 요청했으나 CLI가 이 환경에서 미지원이라 기본 모드로 적용한 경우 */}
      {autoFallbackNotice && (
        <InputBanner
          message={t('chatInput.autoModeFallback')}
          onClose={dismissAutoFallback}
        />
      )}
      {/* 음성 입력 실패 안내. 툴팁이 아니라 인풋배너인 이유는, 사용자가 무언가
          해야 하는 안내(권한 허용·로그인)를 호버해야만 보이는 자리에 두면 안 되기
          때문이다. 앞으로 다른 위치의 기능이 실패할 때도 같은 배너를 재사용한다.

          extend-kit 미설치는 여기 오지 않는다 — 첫 사용 질문이 마이크를 누른
          직후에 설치를 제안하므로, 킷이 없어 실패하는 상황 자체가 그 질문에
          "설치" 로 답한 뒤에나 남는다(설치 실패는 그 자리에서 토스트로 알린다). */}
      {dictation.error && (
        <InputBanner
          message={
            dictation.error.kitMissing
              ? t('chatInput.dictation.kitMissing')
              : // Said in full rather than as "signed out", because the user
                // reaching this is usually NOT signed out: an API key
                // authenticates everything else here and only dictation refuses
                // it, so a banner that just says "sign in" reads as a bug (#355).
                dictation.error.notLoggedIn
                ? t('chatInput.dictation.notLoggedIn')
                : dictation.error.message === 'micDenied'
                ? // Where the block lives differs by environment, and pointing at
                  // the wrong place leaves the user hunting. In a browser the
                  // refusal is remembered per site and only the address-bar
                  // control clears it — no API can re-prompt. Inside the IDE we
                  // grant it ourselves, so a refusal there came from the OS.
                  isBrowser()
                  ? t('chatInput.dictation.micDeniedBrowser')
                  : t('chatInput.dictation.micDenied')
                : dictation.error.message === 'noMic'
                  ? t('chatInput.dictation.noMic')
                  : // Anything else is relayed VERBATIM. We do not know what
                    // else the stream can refuse with, and a message of our own
                    // would have to guess: a 401 handshake rejection can be an
                    // expired token or an account without access, and the next
                    // failure may be neither. Replacing the text with a summary
                    // that covers both would be a summary that is wrong as soon
                    // as a third cause appears, and it throws away the one
                    // string the user can search for (#418).
                    //
                    // What IS ours to add is what the stream told us alongside
                    // it: `fatal` means retrying cannot help, so pressing the
                    // microphone again is not the next step. That is relayed
                    // fact, not our diagnosis.
                    dictation.error.fatal
                    ? t('chatInput.dictation.errorFatal', { message: dictation.error.message })
                    : t('chatInput.dictation.error', { message: dictation.error.message })
          }
          actions={
            dictation.error.kitMissing ? (
              <button
                type="button"
                onClick={installKit}
                disabled={installingKit}
                className="rounded px-2 py-1 text-[0.7692rem] font-medium text-text-link hover:bg-state-info-bg transition-colors disabled:opacity-50"
              >
                {installingKit
                  ? t('chatInput.dictation.installing')
                  : t('chatInput.dictation.install')}
              </button>
            ) : dictation.error.notLoggedIn ? (
              // The same login page AuthErrorBanner sends people to, rather
              // than a second way in: naming the problem without offering the
              // one action that fixes it is what the kit-missing branch above
              // already refuses to do.
              <button
                type="button"
                onClick={navigateToLogin}
                className="rounded px-2 py-1 text-[0.7692rem] font-medium text-text-link hover:bg-state-info-bg transition-colors"
              >
                {t('authError.login')}
              </button>
            ) : (
              // The complaint in #418 was not the wording, it was that the
              // wording was all there was: "There is no additional information,
              // manuals, docs. Nothing." The message above stays exactly as the
              // stream sent it; this is the way out of it. The branches that
              // already offer an action keep theirs, since a doc link is a
              // poorer answer than the button that fixes the problem.
              <a
                href={featureDocUrl('029-voice_to_text')}
                target="_blank"
                rel="noreferrer"
                className="rounded px-2 py-1 text-[0.7692rem] font-medium text-text-link hover:bg-state-info-bg transition-colors"
              >
                {t('chatInput.dictation.help')}
              </a>
            )
          }
          onClose={dictation.dismissError}
        />
      )}
      {/* SDUI 공지(INPUT_BANNER): 서버가 내려주는 공지가 있을 때만 표시 */}
      <AnnouncementInputBannerSlot />
      {/* 메인 인풋 컨테이너 — drag/drop은 window 레벨 리스너가 패널 전체에서 처리한다.
          박스의 모양(테두리·포커스 링·구분선·하단 바)은 InputFrame이 쥐고 있고,
          에이전트 뷰의 컴포저가 같은 것을 쓴다. 여기 있는 것은 전부 슬롯에 넣을
          내용물이다. */}
      <InputFrame
        mode={mode}
        isFocused={isFocused}
        isDragOver={isDragOver}
        overlays={<>
        {/* Prompt library panel. Shares this slot with the mention dropdown and
            the slash command panel, and wins it while the caret is in a `!!`
            token. Rendered first to match the keydown order above. */}
        {promptLibrary.isActive && (
          <div className="absolute bottom-full start-0 w-full z-20">
            <PromptDropdown
              rows={promptLibrary.rows}
              selectedIndex={promptLibrary.selectedIndex}
              isLoading={promptLibrary.isLoading}
              hasLoaded={promptLibrary.hasLoaded}
              categoryRows={promptLibrary.categoryRows}
              selectedCategory={promptLibrary.selectedCategory}
              focusedPane={promptLibrary.focusedPane}
              onSelectCategory={promptLibrary.selectCategory}
              onSelect={promptLibrary.selectRow}
              onEdit={editSavedPrompt}
              onDelete={(prompt) => void deleteSavedPrompt(prompt)}
              onClose={promptLibrary.close}
            />
          </div>
        )}

        {/* Asks for a prompt's `{{...}}` values. Rendered here, above the
            composer it will insert into, so both routes that pick a prompt get
            the same dialog. */}
        {variableFill.pending && (
          <PromptVariablesModal
            content={variableFill.pending.content}
            names={variableFill.pending.names}
            onSubmit={variableFill.submit}
            onCancel={variableFill.cancel}
          />
        )}

        {/* Mention dropdown. Shares this slot with the slash command panel;
            the panel yields whenever the caret is in an @token (issue #236),
            so the two never render at once. */}
        {mention.isActive && !promptLibrary.isActive && (
          <div className="absolute bottom-full start-0 w-full z-20">
            <MentionDropdown
              results={mention.results}
              selectedIndex={mention.selectedIndex}
              isLoading={mention.isLoading}
              onSelect={mention.selectResult}
              onClose={mention.close}
            />
          </div>
        )}

        {/* Slash command panel. Yields the shared slot to an active mention so
            the two can never stack — matching the keydown order above, where
            mention handling also runs first. detectSlashCommand already closes
            the panel on caret-in-@token; this also covers the paths that open
            it without a caret (e.g. the "/" toolbar button). */}
        {palette.showSlashCommands && !mention.isActive && !promptLibrary.isActive && (
          <div className="absolute bottom-full start-0 w-full z-20">
            <CommandPalettePanel
              sections={palette.filteredSections}
              selectedSectionIndex={palette.selectedSectionIndex}
              selectedItemIndex={palette.selectedItemIndex}
              filterQuery={palette.filterQuery}
              onItemClick={palette.selectItem}
              onItemExecute={palette.handlePanelItemExecute}
              onClose={palette.closePanel}
            />
          </div>
        )}

        {/* Model switch panel */}
        {showModelSwitch && (
          <ModelSwitchOverlay
            autoSelectQuery={modelSwitchQuery}
            onClose={() => { setShowModelSwitch(false); setModelSwitchQuery(null); }}
          />
        )}

        {/* Schedule-send popover (from the Context section). Floats above the
            composer; pre-filled from the current draft. Closing it returns focus
            to the composer (the popover took focus for its message box). */}
        {showSchedulePopover && (
          <div className="absolute bottom-full start-0 w-full z-30 mb-2">
            <ScheduleSendPopover
              onClose={() => {
                setShowSchedulePopover(false);
                // Defer past unmount so focus lands on the composer, not a
                // node being torn down (matches the mode-panel restore pattern).
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
            />
          </div>
        )}

        {/* 드래그 오버 오버레이 */}
        <DragOverlay visible={isDragOver} />
        </>}
        editor={<>
          <RichInput
            ref={textareaRef}
            ime={ime}
            value={value}
            onChange={handleRichChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onPaste={handleRichPaste}
            placeholder={
              isStreaming
                ? t('chatInput.placeholder.queueMessage')
                : t('chatInput.placeholder.hint', {
                    send: sendKeyLabel(appSettings.useCtrlEnterToSend ?? false),
                  })
            }
            disabled={disabled}
            ariaLabel={t('chatInput.ariaLabel')}
            highlightTokens={pathTokens}
            interimRange={dictation.interimRange}
          />
          {voiceEnabled && (
            <MicButton
              state={dictation.state}
              level={dictation.level}
              micDenied={dictation.error?.micDenied}
              unavailable={dictationUnavailable}
              disabled={disabled}
              shortcut={displayShortcut(voiceShortcut)}
              onStart={() => void startDictation()}
              onStop={() => void dictation.stop()}
            />
          )}
        </>}
        belowEditor={<>
        {/* 첨부 미리보기 */}
        <AttachmentPreview
          attachments={attachments}
          onRemove={removeAttachment}
        />

        {/* 에러 메시지 */}
        {attachmentError && (
          <div className="px-3 pb-1.5 text-xs text-state-error-fg">
            {attachmentError}
          </div>
        )}
        </>}
        barStart={<>
            {/* On mobile the wrapper drops `relative` so the panel anchors to the
                input box (like the model panel) and can span its full width;
                on desktop it stays a compact panel above the mode tag. */}
            <div className={`${isMobile() ? '' : 'relative'} flex items-center`} ref={modePanelRef}>
              {showModePanel && (
                <div className={`absolute bottom-full start-0 z-30 mb-2 ${isMobile() ? 'end-0' : ''}`}>
                  <ModeSelectPanel
                    modes={availableModes}
                    currentMode={mode}
                    onSelect={(m) => { setInputMode(m); setShowModePanel(false); }}
                  />
                </div>
              )}
              <InputModeTag mode={mode} onClick={() => setShowModePanel((v) => !v)} />
            </div>
            <ContextWindowTag onClick={handleCompact} disabled={isStreaming} />
            {/* IDE 컨텍스트 태그: 현재 열린 파일/선택을 표시하고 포함 여부를 토글 */}
            <IdeSelectionTag />
        </>}
        barEnd={<>
            {/* 모델 태그는 좁아지면 말줄임되고(min-w-0 — 프레임이 준다), 액션
                버튼은 항상 온전히 남아야 하므로 shrink-0으로 보호한다 (issue #217). */}
            <ModelTag />
            <div className="relative shrink-0">
            <AttachMenu
              addImageAttachment={addImageAttachment}
              addFileAttachment={addFileAttachment}
              addFolderAttachment={addFolderAttachment}
              isOpen={showAttachMenu}
              onClose={() => setShowAttachMenu(false)}
            />
            <ActionButtons
              mode={mode}
              isActive={isActive}
              disabled={disabled}
              hasValue={hasValue}
              onAttach={() => setShowAttachMenu(prev => !prev)}
              onSlashCommand={palette.handleSlashButtonClick}
              onSubmit={() => {
                onSubmit(undefined, mode, attachments.length > 0 ? attachments : undefined);
                clearAttachments();
                setPathTokens([]);
              }}
              onStop={onStop}
            />
            </div>
        </>}
      />
      {/* 첫 마이크 클릭에서 한 번만 뜨는 질문. 렌더 트리 최상단에 두는 이유는
          Portal로 그려지므로 위치가 레이아웃에 영향을 주지 않고, 인풋 내부에
          두면 컴포저가 조건부로 언마운트될 때 함께 사라지기 때문이다. */}
      {confirmDialog}
    </div>
  );
}
