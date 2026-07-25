import { useCallback, useEffect, useRef, KeyboardEvent, useState, type ClipboardEvent as ReactClipboardEvent, type DragEvent as ReactDragEvent } from 'react';
import { CommandPalettePanel } from '@/commandPalette/ui/CommandPalettePanel';
import { useCommandPalette } from '@/commandPalette/hooks/useCommandPalette';
import { PanelSectionId, PanelItemType, CommandItem } from '@/types/commandPalette';
import { INPUT_MODES, CLI_FLAG_TO_INPUT_MODE } from '../../../types/chatInput';
import { InputModeTag } from './InputModeTag';
import { ModeSelectPanel } from './ModeSelectPanel';
import { ActionButtons } from './ActionButtons';
import { useChatInputFocus } from '../../../contexts/ChatInputFocusContext';
import { useInputHistory } from './hooks/useInputHistory';
import { useSessionContext } from '@/contexts/SessionContext';
import { useChatStreamContext } from '@/contexts/ChatStreamContext';
import { useChatInputState } from '@/contexts/ChatInputStateContext';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { getTextContent, SessionState } from '@/types';
import { LoadedMessageType } from '@/dto';
import { useAttachments } from './hooks/useAttachments';
import { AttachmentPreview } from './AttachmentPreview';
import { ContextWindowTag } from './ContextWindowTag';
import { IdeSelectionTag } from './IdeSelectionTag';
import { ModelTag } from './ModelTag';
import { DragOverlay } from './DragOverlay';
import { AttachMenu } from './AttachMenu';
import { ModelSwitchOverlay, SWITCH_MODEL_EVENT } from '@/pages/ChatPage/ModelSwitchOverlay';
import { EFFORT_CYCLE_EVENT } from '@/commandPalette/sections/model/EffortItem';
import { THINKING_TOGGLE_EVENT } from '@/commandPalette/sections/model/ThinkingItem';
import { OPEN_SESSION_DROPDOWN_EVENT } from '@/commandPalette/sections/context/items';
import { useClaudeSettings } from '@/contexts/ClaudeSettingsContext';
import { useEffort } from '@/hooks/useEffort';
import { useMention } from './hooks/useMention';
import { useEditorContext } from '@/hooks/useEditorContext';
import { MentionDropdown } from './MentionDropdown';
import { isMobile } from '@/config/environment';
import { shouldSubmitOnEnter } from './shouldSubmitOnEnter';
import { basename } from './basename';
import { RichInput } from './RichInput';
import { useIMEComposition } from './RichInput/useIMEComposition';
import { insertNewlineAtCursor } from './RichInput/insertNewlineAtCursor';
import { TelemetryConsentBanner } from '../TelemetryConsentBanner';
import { InputBanner } from '../InputBanner';
import { AnnouncementInputBannerSlot } from '@/components/Announcements/placements';
import { useTelemetryConsent, ConsentStatus, ConsentSource } from '@/hooks/useTelemetryConsent';
import { getCaretOffset, setCaretOffset, getSelectionRange } from '@/utils/domSelection';
import { MessageType } from '@/shared';
import { useTranslation } from '@/i18n';

interface NativeDropEntry {
  path: string;
  type: 'file' | 'folder';
}

export function ChatInput() {
  const { t } = useTranslation('chat');
  const { textareaRef } = useChatInputFocus();
  const { currentSessionId, sessionState, workingDirectory, inputMode: mode, cycleInputMode: cycleMode, setInputMode, availableModes, syncInitialInputMode, modeResetTrigger, autoFallbackNotice, dismissAutoFallback } = useSessionContext();
  const chatStream = useChatStreamContext();
  const { handleSubmit: onSubmit, isStreaming, stop: onStop } = chatStream;
  const { input: value, setInput: onChange } = useChatInputState();
  const inputHistory = useInputHistory();
  const { initHistory, pushToHistory, navigateUp, navigateDown } = inputHistory;
  // Read messages lazily via ref so ChatInput does not re-render every streaming token.
  const messagesRef = useRef(chatStream.messages);
  messagesRef.current = chatStream.messages;
  const bridge = useBridgeContext();
  const { subscribe } = bridge;
  const [isFocused, setIsFocused] = useState(false);
  // Known path tokens (e.g. `src/file.ts#L10-L25`) inserted via Alt+K /
  // EDITOR_CONTEXT, highlighted as chips in the composer. Reset on submit and
  // session switch (where `value` returns to '').
  const [pathTokens, setPathTokens] = useState<string[]>([]);
  const lastInitSessionRef = useRef<string | undefined>(undefined);

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

  const { settings: claudeSettings, updateSetting: updateClaudeSetting } = useClaudeSettings();
  const { cycle: cycleEffort } = useEffort();
  const lastMetaArrowTime = useRef<number>(0);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showModelSwitch, setShowModelSwitch] = useState(false);
  const [modelSwitchQuery, setModelSwitchQuery] = useState<string | null>(null);
  const [showModePanel, setShowModePanel] = useState(false);
  const modePanelRef = useRef<HTMLDivElement>(null);

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
  const { status: consentStatus, accept: acceptConsent, deny: denyConsent } = useTelemetryConsent();
  const [consentDismissed, setConsentDismissed] = useState(false);

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

  // Claude settings의 permissions.defaultMode에서 초기 모드 결정
  const defaultModeFlag = claudeSettings.permissions?.defaultMode;
  const initialInputMode = defaultModeFlag
    ? (CLI_FLAG_TO_INPUT_MODE[defaultModeFlag] ?? 'ask_before_edit')
    : 'ask_before_edit';
  useEffect(() => {
    syncInitialInputMode(initialInputMode);
  }, [initialInputMode, syncInitialInputMode, modeResetTrigger]);

  const modeConfig = INPUT_MODES[mode];

  // IME composition truth (ref-only) shared between this keydown handler and the
  // RichInput editor. Under JCEF the native `isComposing` flag is unreliable.
  const ime = useIMEComposition();

  const palette = useCommandPalette({ onChange, textareaRef });

  const mention = useMention({
    workingDirectory,
    value,
    onChange,
    // @-mention selection inserts an inline path token (same chip set as Alt+K
    // editor-context inserts), then restores the caret just past the token.
    onInsertMention: (token, caretOffset) => {
      setPathTokens(prev => (prev.includes(token) ? prev : [...prev, token]));
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) setCaretOffset(el, caretOffset);
      });
    },
  });

  // Backend pushes EDITOR_CONTEXT (the file the user is viewing + selection)
  // → insert `relativePath[#L..]` at the composer caret.
  // shouldFocus is controlled by the focusInputOnEditorContext user setting (default true).
  useEditorContext({
    value,
    onChange,
    textareaRef,
    currentWorkingDir: workingDirectory ?? '',
    shouldFocus: claudeSettings.focusInputOnEditorContext ?? true,
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
      initHistory([]);
      lastInitSessionRef.current = undefined;
      // 새 세션에서는 동의 배너를 다시 노출한다(미응답 상태인 경우).
      setConsentDismissed(false);
    }
  }, [currentSessionId, clearAttachments, initHistory]);

  const isActive = isStreaming
    || sessionState === SessionState.WaitingPermission
    || sessionState === SessionState.HasDiff;

  const isInterruptible = isActive;

  // ESC key: interrupt streaming or active state
  useEffect(() => {
    const handleEscKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && isInterruptible) {
        e.preventDefault();
        onStop();
        // Re-focus textarea after interrupt
        setTimeout(() => textareaRef.current?.focus(), 50);
      }
    };

    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, [isInterruptible, onStop, textareaRef]);

  // [KeyDebug] window 캡처 단계 Arrow 키 로깅
  useEffect(() => {
    const handleArrowCapture = (e: globalThis.KeyboardEvent) => {
      if (!e.key.startsWith('Arrow')) return;
      console.log('[KeyDebug:window-capture]', e.key, { altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, defaultPrevented: e.defaultPrevented });
    };
    window.addEventListener('keydown', handleArrowCapture, true);
    return () => window.removeEventListener('keydown', handleArrowCapture, true);
  }, []);

  // Populate input history from session messages on session change.
  // Read messages via ref to avoid re-running this effect on every streaming token —
  // we only care about the messages snapshot at session-switch time.
  useEffect(() => {
    if (!currentSessionId || currentSessionId === lastInitSessionRef.current) return;
    if (messagesRef.current.length === 0) return;

    lastInitSessionRef.current = currentSessionId;

    const userTexts = messagesRef.current
      .filter(m => m.type === LoadedMessageType.User)
      .map(m => getTextContent(m))
      .filter((t): t is string => Boolean(t));
    initHistory(userTexts);
  }, [currentSessionId, initHistory]);

  const handleRichChange = useCallback((newValue: string) => {
    onChange(newValue);
    palette.detectSlashCommand(newValue);
    const caret = textareaRef.current ? getCaretOffset(textareaRef.current) : newValue.length;
    mention.detectMention(newValue, caret);
  }, [onChange, palette, mention, textareaRef]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.startsWith('Arrow')) console.log('[KeyDebug:textarea-keydown]', e.key, { altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, defaultPrevented: e.defaultPrevented });

    // Feed the IME truth: keyCode 229 means the IME is still processing this
    // keystroke, so mark composition active before any Enter decision runs.
    ime.noteKeyDown(e.nativeEvent.keyCode);

    // JCEF workaround: Cmd+Arrow 처리 후 발생하는 순수 Arrow 유령 이벤트 무시
    const isArrowKey = e.key.startsWith('Arrow');
    const hasModifier = e.metaKey || e.altKey || e.ctrlKey;
    if (isArrowKey && !hasModifier && Date.now() - lastMetaArrowTime.current < 50) {
      e.preventDefault();
      return;
    }

    // Shift+Tab: 모드 전환
    if (e.shiftKey && e.key === 'Tab') {
      e.preventDefault();
      cycleMode();
      return;
    }

    // JCEF workaround: Cmd+Arrow (macOS 줄 처음/끝 이동) 수동 처리
    // shiftKey가 있으면 선택 영역 확장이므로 기본 동작에 맡김
    if (e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey && isArrowKey) {
      const editor = e.currentTarget;
      const pos = getCaretOffset(editor);
      const text = editor.textContent ?? '';

      e.preventDefault();
      lastMetaArrowTime.current = Date.now();

      if (e.key === 'ArrowLeft') {
        const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
        setCaretOffset(editor, lineStart);
      } else if (e.key === 'ArrowRight') {
        let lineEnd = text.indexOf('\n', pos);
        if (lineEnd === -1) lineEnd = text.length;
        setCaretOffset(editor, lineEnd);
      } else if (e.key === 'ArrowUp') {
        setCaretOffset(editor, 0);
      } else if (e.key === 'ArrowDown') {
        setCaretOffset(editor, text.length);
      }
      return;
    }

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
        claudeSettings.useCtrlEnterToSend ?? false,
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
      console.log('[KeyDebug:history-up-triggered]');
      // 복수행: 커서가 첫 번째 줄에 있을 때만 히스토리 탐색
      const pos = getCaretOffset(e.currentTarget);
      if (value.lastIndexOf('\n', pos - 1) !== -1) return;

      const historyValue = navigateUp(value);
      if (historyValue === null) return;
      e.preventDefault();
      onChange(historyValue);
    } else if (e.key === 'ArrowDown' && !palette.showSlashCommands) {
      console.log('[KeyDebug:history-down-triggered]');
      // 복수행: 커서가 마지막 줄에 있을 때만 히스토리 탐색
      const pos = getCaretOffset(e.currentTarget);
      if (value.indexOf('\n', pos) !== -1) return;

      const historyValue = navigateDown();
      if (historyValue === null) return;
      e.preventDefault();
      onChange(historyValue);
    }
  }, [disabled, value, attachments.length, onSubmit, pushToHistory, navigateUp, navigateDown, onChange, palette, mention, cycleMode, clearAttachments, mode, claudeSettings.useCtrlEnterToSend, ime, handleRichChange]);

  // Wrap the attachment paste handler so that, when the clipboard carries no
  // image, we insert the plain-text payload ourselves. contentEditable would
  // otherwise paste rich HTML; plaintext-only strips formatting but we still
  // route through onChange to keep `value` the single source of truth.
  const handleRichPaste = useCallback((e: ReactClipboardEvent<HTMLDivElement>) => {
    const items = e.clipboardData?.items;
    const hasImage = items
      ? Array.from(items).some(item => item.kind === 'file' && item.type.startsWith('image/'))
      : false;

    if (hasImage) {
      // Delegate image handling (it calls preventDefault internally).
      handlePaste(e);
      return;
    }

    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    e.preventDefault();
    const el = textareaRef.current;
    const { start, end } = el ? getSelectionRange(el) : { start: value.length, end: value.length };
    const newValue = value.slice(0, start) + text + value.slice(end);
    onChange(newValue);
    palette.detectSlashCommand(newValue);
    const caret = start + text.length;
    mention.detectMention(newValue, caret);
    requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (target) setCaretOffset(target, caret);
    });
  }, [handlePaste, value, onChange, palette, mention, textareaRef]);

  const hasValue = !!value.trim() || attachments.length > 0;

  return (
    <div className="max-w-[44rem] mx-auto px-4 pb-[14px] pt-2">
      {/* 텔레메트리 동의 인풋배너: 미응답(PENDING)이고 이 세션에서 닫지 않았을 때만 표시 */}
      {consentStatus === ConsentStatus.PENDING && !consentDismissed && (
        <TelemetryConsentBanner
          onAccept={() => void acceptConsent(ConsentSource.BANNER)}
          onDeny={() => void denyConsent(ConsentSource.BANNER)}
          onClose={() => setConsentDismissed(true)}
        />
      )}
      {/* Auto mode 강등 안내: auto를 요청했으나 CLI가 이 환경에서 미지원이라 기본 모드로 적용한 경우 */}
      {autoFallbackNotice && (
        <InputBanner
          message={t('chatInput.autoModeFallback')}
          onClose={dismissAutoFallback}
        />
      )}
      {/* SDUI 공지(INPUT_BANNER): 서버가 내려주는 공지가 있을 때만 표시 */}
      <AnnouncementInputBannerSlot />
      {/* 메인 인풋 컨테이너 — drag/drop은 window 레벨 리스너가 패널 전체에서 처리한다. */}
      <div
        className={`
          relative rounded-lg border bg-surface-raised
          transition-colors duration-150
          ${isDragOver ? 'border-border-focus bg-accent-primary/5' : isFocused ? `${modeConfig.borderColorFocused} outline outline-4 ${modeConfig.outline}` : modeConfig.borderColor}
        `}
      >
        {/* Mention dropdown */}
        {mention.isActive && !palette.showSlashCommands && (
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

        {/* Slash command panel */}
        {palette.showSlashCommands && (
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

        {/* 드래그 오버 오버레이 */}
        <DragOverlay visible={isDragOver} />

        {/* Composer 영역 */}
        <div className="pt-2.5 pb-1.5">
          <RichInput
            ref={textareaRef}
            ime={ime}
            value={value}
            onChange={handleRichChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onPaste={handleRichPaste}
            placeholder={isStreaming ? t('chatInput.placeholder.queueMessage') : t('chatInput.placeholder.focusHint')}
            disabled={disabled}
            ariaLabel={t('chatInput.ariaLabel')}
            highlightTokens={pathTokens}
          />
        </div>

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

        {/* 구분선 */}
        <div className="border-t border-border-subtle" />

        {/* 하단 바: 모드 태그 + 파일 태그 + 액션 버튼 */}
        <div className="flex items-center justify-between px-[5px] py-[3px] h-[35px]">
          {/* 좌측: 모드 태그 + 파일 태그들 */}
          <div className="flex items-center gap-0.5 xs:gap-1">
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
          </div>

          {/* 우측: 모델 태그 + 액션 버튼들 + 첨부 드롭다운 메뉴 */}
          <div className="flex items-center gap-0.5 xs:gap-1">
            <ModelTag />
            <div className="relative">
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
          </div>
        </div>
      </div>
    </div>
  );
}
