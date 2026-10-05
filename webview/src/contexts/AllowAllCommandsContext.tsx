import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useSessionContext } from './SessionContext';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { useTranslation } from '@/i18n';

/**
 * Whether a session answers the CLI's unskippable safety prompts on its own.
 *
 * The CLI marks some approvals with `suppress_always_allow_rule`: it will not
 * keep a rule for them, so "allow for the session" cannot be delegated to it and
 * it asks again every time. When the user has knowingly turned this on, the GUI
 * answers those requests itself instead of showing the panel.
 *
 * Kept in memory and keyed by session, like the auto-resume override: it is an
 * in-the-moment choice about one conversation, and a fresh session starts with
 * the panel back on.
 *
 * A conversation that has not sent its first message has no session yet, so the
 * switch can be turned on there too: that choice is held as the next
 * conversation's, and the code that creates the session from the first message
 * hands it over (adoptDraft). Opening an existing session from that empty screen
 * does not inherit it, since the choice was about a new conversation.
 */
interface AllowAllCommandsContextValue {
  /** `null` asks about the conversation that has no session yet. */
  isEnabled: (sessionId: string | null | undefined) => boolean;
  /** `null` sets it for the conversation that has no session yet. */
  setEnabled: (sessionId: string | null, value: boolean) => void;
  /**
   * Warn, then turn it on for the conversation that is open when the warning is
   * answered. Resolves to whether it was turned on.
   *
   * The warning is drawn by this provider, not by whoever asked: the slash
   * command panel closes on any mousedown outside it, which includes the
   * warning's own buttons, and a warning that lived inside the panel went with
   * it before its answer arrived.
   */
  requestEnable: () => Promise<boolean>;
  /** The warning is on screen, so the panel that asked should not answer keys. */
  confirmOpen: boolean;
  /**
   * Give the session that was just created from the first message whatever was
   * chosen before it existed. Called by whoever creates that session, because
   * only the creator knows it is new: by the time the session shows up in the
   * list, a session that is new looks the same as one that was always there.
   */
  adoptDraft: (sessionId: string) => void;
}

const AllowAllCommandsContext = createContext<AllowAllCommandsContextValue | null>(null);

interface Props {
  children: ReactNode;
}

export function AllowAllCommandsProvider(props: Props) {
  const { children } = props;
  const { t } = useTranslation('chat');
  const { currentSessionId } = useSessionContext();
  const { confirm, confirmDialog } = useConfirmDialog();
  const [enabledSessions, setEnabledSessions] = useState<Record<string, boolean>>({});
  const [enabledBeforeFirstMessage, setEnabledBeforeFirstMessage] = useState(false);

  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  // Mirrors the state so adoptDraft, called in the same tick as the click that
  // turned it on, sees the value without waiting for a render.
  const draftRef = useRef(false);
  const previousSessionIdRef = useRef(currentSessionId);

  // Any session appearing on the empty screen ends its draft: a new one was
  // given the choice by adoptDraft already, and an existing one opened from the
  // list must not inherit a choice that was about a new conversation.
  useEffect(() => {
    const previous = previousSessionIdRef.current;
    previousSessionIdRef.current = currentSessionId;
    if (previous === null && currentSessionId !== null) {
      draftRef.current = false;
      setEnabledBeforeFirstMessage(false);
    }
  }, [currentSessionId]);

  const isEnabled = useCallback(
    (sessionId: string | null | undefined): boolean =>
      sessionId ? enabledSessions[sessionId] === true : enabledBeforeFirstMessage,
    [enabledSessions, enabledBeforeFirstMessage],
  );

  const setEnabled = useCallback((sessionId: string | null, value: boolean): void => {
    if (sessionId === null) {
      draftRef.current = value;
      setEnabledBeforeFirstMessage(value);
      return;
    }
    setEnabledSessions((prev) => ({ ...prev, [sessionId]: value }));
  }, []);

  const adoptDraft = useCallback((sessionId: string): void => {
    if (!draftRef.current) return;
    draftRef.current = false;
    setEnabledBeforeFirstMessage(false);
    setEnabledSessions((prev) => ({ ...prev, [sessionId]: true }));
  }, []);

  const requestEnable = useCallback(async (): Promise<boolean> => {
    const confirmed = await confirm({
      title: t('allowAllCommands.confirmTitle'),
      message: t('allowAllCommands.confirmMessage'),
      confirmLabel: t('allowAllCommands.confirmLabel'),
      variant: 'danger',
    });
    // The conversation open now, not the one open when the link was clicked.
    if (confirmed) setEnabled(currentSessionIdRef.current, true);
    return confirmed;
  }, [confirm, setEnabled, t]);

  return (
    <AllowAllCommandsContext.Provider
      value={{ isEnabled, setEnabled, requestEnable, confirmOpen: confirmDialog !== null, adoptDraft }}
    >
      {children}
      {confirmDialog}
    </AllowAllCommandsContext.Provider>
  );
}

export function useAllowAllCommands(): AllowAllCommandsContextValue {
  const ctx = useContext(AllowAllCommandsContext);
  if (!ctx) {
    throw new Error('useAllowAllCommands must be used within an AllowAllCommandsProvider');
  }
  return ctx;
}

/**
 * For code that may run where no provider is mounted (the chat stream, which
 * several test setups render on its own). Returns null there rather than throwing.
 */
export function useOptionalAllowAllCommands(): AllowAllCommandsContextValue | null {
  return useContext(AllowAllCommandsContext);
}
