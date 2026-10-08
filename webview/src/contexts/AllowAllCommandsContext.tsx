import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { useSessionContext } from './SessionContext';
import { useSettings } from './SettingsContext';
import { useConfirmDialog } from '@/components/ConfirmDialog/useConfirmDialog';
import { SettingBadge, SettingBadgeVariant } from '@/components/SettingBadge';
import { useSponsorStatus } from '@/hooks/queries/useSponsorStatus';
import { useTranslation } from '@/i18n';
import { SponsorGate, SponsorGateStep, SponsorGateSurface } from '@/shared';
import { SettingKey } from '@/types/settings';
import { ensureSponsor } from '@/utils/ensureSponsor';
import { followSponsorOffer } from '@/utils/followSponsorOffer';
import { reportSponsorGate } from '@/utils/reportSponsorGate';

/**
 * Whether a session answers the CLI's unskippable safety prompts on its own.
 *
 * The CLI marks some approvals with `suppress_always_allow_rule`: it will not
 * keep a rule for them, so "allow for the session" cannot be delegated to it and
 * it asks again every time. When the user has knowingly turned this on, the GUI
 * answers those requests itself instead of showing the panel.
 *
 * Two layers decide it. A session's own choice, kept in memory and keyed by
 * session like the auto-resume override, is an in-the-moment decision about one
 * conversation and is free. The default every session falls back to when it has
 * made no choice is the app setting `allowAllCommandsByDefault`, which is
 * sponsor-only. The session's choice wins, so a session can turn the default off
 * for itself and a fresh session simply follows the default.
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
   * The default in effect for sessions that made no choice of their own: stored
   * on, written by a sponsor who still is one, and not supplied by a project
   * file (see {@link AllowAllCommandsProvider}).
   */
  enabledByDefault: boolean;
  /**
   * Warn, then turn it on for the conversation that is open when the warning is
   * answered. Resolves to whether it was turned on.
   *
   * The warning carries a "keep this on in all sessions" box, which writes the
   * default setting along with the answer, checked or not.
   *
   * The warning is drawn by this provider, not by whoever asked: the slash
   * command panel closes on any mousedown outside it, which includes the
   * warning's own buttons, and a warning that lived inside the panel went with
   * it before its answer arrived.
   */
  requestEnable: () => Promise<boolean>;
  /**
   * The Settings switch: sponsor check, then the same warning worded for every
   * session and without the box, then the default setting. Resolves to whether
   * the default was turned on.
   */
  requestEnableByDefault: () => Promise<boolean>;
  /** Turn the default off. Needs no confirmation: it only brings the panel back. */
  disableByDefault: () => Promise<void>;
  /**
   * The option beyond one session is closed to this user, which the screens show
   * as a locked control that leads to the Sponsor page. Not locked while the
   * status is still loading: a sponsor must not see a lock flash up, nor be
   * counted as having been offered something they already own.
   */
  sponsorLocked: boolean;
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
  const { settings, overrides, updateSettingWithScope } = useSettings();
  const { isSponsor, isLoading: sponsorLoading } = useSponsorStatus();
  const sponsorLocked = !sponsorLoading && !isSponsor;
  const { confirm, confirmWithCheckbox, confirmDialog } = useConfirmDialog();
  const [enabledSessions, setEnabledSessions] = useState<Record<string, boolean>>({});
  // `null` is "no choice yet", which reads as the default. A bare boolean would
  // make "never touched" and "turned off" the same thing, and the second has to
  // beat a default that is on.
  const [draftChoice, setDraftChoice] = useState<boolean | null>(null);

  // The default is the stored value only while all three hold:
  //  - it is on in the settings, which is where the user chose it;
  //  - the user is a sponsor now. The stored value is kept when a sponsorship
  //    lapses (it is the user's choice and returns with the sponsorship), but it
  //    must not keep answering the CLI's warnings while nothing entitles it to;
  //  - the project file does not carry the key. That file lives inside the
  //    repository, so a cloned repo could otherwise ship it switched on. A
  //    project that carries the key at all reads as off, which also gives a
  //    project its way to opt out.
  const enabledByDefault =
    settings[SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT] === true &&
    isSponsor &&
    !overrides.includes(SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT);

  const currentSessionIdRef = useRef(currentSessionId);
  currentSessionIdRef.current = currentSessionId;
  const enabledByDefaultRef = useRef(enabledByDefault);
  enabledByDefaultRef.current = enabledByDefault;
  const sponsorLockedRef = useRef(sponsorLocked);
  sponsorLockedRef.current = sponsorLocked;
  // Mirrors the state so adoptDraft, called in the same tick as the click that
  // turned it on, sees the value without waiting for a render.
  const draftRef = useRef<boolean | null>(null);
  const previousSessionIdRef = useRef(currentSessionId);

  // Any session appearing on the empty screen ends its draft: a new one was
  // given the choice by adoptDraft already, and an existing one opened from the
  // list must not inherit a choice that was about a new conversation.
  useEffect(() => {
    const previous = previousSessionIdRef.current;
    previousSessionIdRef.current = currentSessionId;
    if (previous === null && currentSessionId !== null) {
      draftRef.current = null;
      setDraftChoice(null);
    }
  }, [currentSessionId]);

  const isEnabled = useCallback(
    (sessionId: string | null | undefined): boolean =>
      (sessionId ? enabledSessions[sessionId] : draftChoice) ?? enabledByDefault,
    [enabledSessions, draftChoice, enabledByDefault],
  );

  const setEnabled = useCallback((sessionId: string | null, value: boolean): void => {
    if (sessionId === null) {
      draftRef.current = value;
      setDraftChoice(value);
      return;
    }
    setEnabledSessions((prev) => ({ ...prev, [sessionId]: value }));
  }, []);

  const adoptDraft = useCallback((sessionId: string): void => {
    const choice = draftRef.current;
    if (choice === null) return;
    draftRef.current = null;
    setDraftChoice(null);
    setEnabledSessions((prev) => ({ ...prev, [sessionId]: choice }));
  }, []);

  const writeDefault = useCallback(
    // Global scope only: see the scope policy in the backend settings.
    (value: boolean): Promise<void> =>
      updateSettingWithScope(SettingKey.ALLOW_ALL_COMMANDS_BY_DEFAULT, value, 'global'),
    [updateSettingWithScope],
  );

  const requestEnable = useCallback(async (): Promise<boolean> => {
    const { confirmed, checked } = await confirmWithCheckbox({
      title: t('allowAllCommands.confirmTitle'),
      message: t('allowAllCommands.confirmMessage'),
      confirmLabel: t('allowAllCommands.confirmLabel'),
      variant: 'danger',
      checkbox: {
        label: t('allowAllCommands.allSessionsLabel'),
        hint: t('allowAllCommands.allSessionsHint'),
        // Where the default stands now, so answering without touching the box
        // leaves it exactly as it was.
        defaultChecked: enabledByDefaultRef.current,
        badge: <SettingBadge variant={SettingBadgeVariant.Sponsor} />,
        // Ticking the box is the sponsor-only part. The session's own switch
        // stays free. For a user without it the box is shown locked rather than
        // hidden, and pressing it leads to the Sponsor page.
        locked: sponsorLockedRef.current,
        onLockedShown: () =>
          reportSponsorGate(SponsorGate.AllowAllCommands, SponsorGateStep.Seen, {
            from: SponsorGateSurface.ConfirmDialog,
          }),
        onLockedClick: () => followSponsorOffer(SponsorGate.AllowAllCommands, SponsorGateSurface.ConfirmDialog),
        // For a box that is open: the cached status can be a step behind, so the
        // tick is checked afresh. Refusing leaves the dialog open and usable.
        beforeCheck: () => ensureSponsor(SponsorGate.AllowAllCommands, SponsorGateSurface.ConfirmDialog),
      },
    });
    if (!confirmed) return false;
    // The conversation open now, not the one open when the link was clicked. It
    // is set explicitly even when the default is on, because the user may have
    // turned this session off before asking again.
    setEnabled(currentSessionIdRef.current, true);
    if (checked !== enabledByDefaultRef.current) await writeDefault(checked);
    return true;
  }, [confirmWithCheckbox, setEnabled, t, writeDefault]);

  const requestEnableByDefault = useCallback(async (): Promise<boolean> => {
    // The sponsor check comes before the warning: reading what it hands over and
    // then being turned away is worse than being turned away first.
    if (!(await ensureSponsor(SponsorGate.AllowAllCommands, SponsorGateSurface.SettingsToggle))) return false;
    const confirmed = await confirm({
      title: t('allowAllCommands.confirmAllSessionsTitle'),
      message: t('allowAllCommands.confirmAllSessionsMessage'),
      confirmLabel: t('allowAllCommands.confirmLabel'),
      variant: 'danger',
    });
    if (!confirmed) return false;
    await writeDefault(true);
    return true;
  }, [confirm, t, writeDefault]);

  const disableByDefault = useCallback((): Promise<void> => writeDefault(false), [writeDefault]);

  return (
    <AllowAllCommandsContext.Provider
      value={{
        isEnabled,
        setEnabled,
        enabledByDefault,
        requestEnable,
        requestEnableByDefault,
        disableByDefault,
        sponsorLocked,
        confirmOpen: confirmDialog !== null,
        adoptDraft,
      }}
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
