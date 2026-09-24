import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthContext } from '@/contexts';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useAccountQuery } from '@/hooks/queries/useAccountQuery';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { useNavigateToLogin } from '@/hooks';
import { runKitInstall } from '@/utils/runKitInstall';
import { MessageType } from '@/shared';
import { SettingKey } from '@/types/settings';
import { openDockEditor } from './openDockEditor';
import { ActionKind, StepStatus, type ChecklistStep } from './types';

export interface OnboardingChecklistState {
  steps: ChecklistStep[];
  /**
   * When the card was closed, null if it never was, and undefined while the
   * answer is still on its way.
   *
   * This is the ONLY thing that decides whether the card is raised. How far the
   * steps got does not enter into it: a card closed with everything unfinished
   * is just as closed as one closed with everything done.
   *
   * The three values are three different things and the middle one is the only
   * one that raises the card. Reading "not yet answered" as "never closed" would
   * flash the card at every install that already closed it, once per launch.
   */
  dismissedAt: string | null | undefined;
  /**
   * Every step is done, optional ones included.
   *
   * Nothing is gated on this. It is what the card's "Get started" button waits
   * for, and that button is one of two ways to close the card — the other being
   * the close button, which never waits for anything.
   */
  allDone: boolean;
  /** Record that the card was closed, so it is never raised again. */
  dismiss: () => void;
}

/**
 * The four things worth having in place before the chat is at its best, and how
 * far along this machine is.
 *
 * Every status is asked for fresh. None of it is recorded, because none of it is
 * history — the kit can be removed in a terminal and the CLI can be signed out
 * between two launches, and a remembered "installed" would then be the app
 * telling the user something that stopped being true. The one thing that IS
 * recorded is that the card was closed, and that lives in
 * `~/.claude-code-gui/profile.json` rather than the webview: a JetBrains webview
 * is served from a new origin on every launch, so anything kept on the page
 * starts empty after a restart and the close button would only hold until the
 * IDE was reopened (#453).
 *
 * Every check is the one the rest of the app already uses, not a second opinion:
 * the account query behind AuthContext, the kit query behind the Voice input
 * section, the same settings value the dock editor writes. Two answers to one
 * question is a bug waiting for the day they disagree.
 */
export function useOnboardingChecklist(): OnboardingChecklistState {
  const { isConnected, send } = useBridgeContext();
  const queryClient = useQueryClient();

  const dismissedAtQuery = useQuery<string | null, Error>({
    queryKey: [MessageType.GET_ONBOARDING_DISMISSED_AT],
    enabled: isConnected,
    queryFn: async () => {
      const r = (await send(MessageType.GET_ONBOARDING_DISMISSED_AT)) as { dismissedAt?: unknown };
      return typeof r?.dismissedAt === 'string' && r.dismissedAt.length > 0 ? r.dismissedAt : null;
    },
  });

  const dismissMutation = useMutation<string | null, Error, void>({
    mutationFn: async () => {
      const r = (await send(MessageType.DISMISS_ONBOARDING)) as { dismissedAt?: unknown };
      return typeof r?.dismissedAt === 'string' ? r.dismissedAt : null;
    },
    // Close on the click, not on the round trip. The record has to reach disk to
    // survive a restart, but the user asking for the card to go is not waiting
    // on that. The moment written here is replaced by the backend's own on the
    // way back; what matters to this screen is only that it is no longer null.
    onMutate: () => {
      queryClient.setQueryData(
        [MessageType.GET_ONBOARDING_DISMISSED_AT],
        new Date().toISOString(),
      );
    },
    onSuccess: (dismissedAt) => {
      queryClient.setQueryData([MessageType.GET_ONBOARDING_DISMISSED_AT], dismissedAt);
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: [MessageType.GET_ONBOARDING_DISMISSED_AT],
      });
    },
  });

  const cliQuery = useQuery<string | null, Error>({
    queryKey: [MessageType.GET_DETECTED_CLI_PATH],
    enabled: isConnected,
    queryFn: async () => {
      const r = (await send(MessageType.GET_DETECTED_CLI_PATH, {})) as { path?: unknown };
      return typeof r?.path === 'string' && r.path.length > 0 ? r.path : null;
    },
  });

  const account = useAccountQuery();
  const kit = useExtendKit();
  const { settings, isLoading: settingsLoading } = useSettings();
  const navigateToLogin = useNavigateToLogin();
  // The same re-check the inline login control runs, which refreshes the saved
  // accounts alongside the live one so a login made in a terminal is picked up
  // whole rather than half.
  const { refetch: refetchAuth } = useAuthContext();

  const dismiss = useCallback(() => dismissMutation.mutate(), [dismissMutation]);
  const recheckCli = useCallback(() => void cliQuery.refetch(), [cliQuery]);

  const steps = useMemo<ChecklistStep[]>(() => {
    const dock = settings[SettingKey.DOCK_LAYOUT];
    // `settings.ts` states the contract: both lists empty means the dock was
    // never arranged. There is no separate "unset" value to read.
    const dockArranged = (dock?.order?.length ?? 0) > 0 || (dock?.visible?.length ?? 0) > 0;

    return [
      {
        id: 'installCli',
        status: cliQuery.isPending
          ? StepStatus.CHECKING
          : cliQuery.isError
            ? StepStatus.UNKNOWN
            : cliQuery.data
              ? StepStatus.DONE
              : StepStatus.TODO,
        // Installing a CLI is a terminal's job, so the only thing this row can
        // offer is to look again once that is done.
        actions: [
          { kind: ActionKind.RECHECK, run: recheckCli, running: cliQuery.isFetching },
        ],
      },
      {
        id: 'signIn',
        // `useAccountQuery` keeps the last good answer on a failed check and
        // only throws when it has none, so "no data and an error" is the
        // undetermined case rather than a logout. (#178)
        status: account.data
          ? account.data.loggedIn
            ? StepStatus.DONE
            : StepStatus.TODO
          : account.isError
            ? StepStatus.UNKNOWN
            : StepStatus.CHECKING,
        // Two acts, two buttons. Signing in here and saying "I already did,
        // somewhere else" are different things, and one control cannot mean
        // both — a login that happened in a terminal needs the second.
        actions: [
          { kind: ActionKind.LOGIN, run: () => navigateToLogin() },
          { kind: ActionKind.RECHECK, run: () => void refetchAuth(), running: account.isFetching },
        ],
      },
      {
        id: 'installKit',
        // Optional, and the row's own hint has always said why: "Chat works
        // without it". The kit carries account switching, the usage panel and
        // dictation, none of which a prompt goes through. Marked required it
        // turned a convenience into a gate on the composer, and every user who
        // had simply never installed it lost the chat they were already using
        // (#482).
        optional: true,
        // Three answers, not two. `useExtendKit` reports `installed: null` both
        // for a kit that is genuinely absent and for a lookup that never came
        // back, and reading the second as the first is the shape of #178.
        status: kit.info
          ? kit.info.installed
            ? StepStatus.DONE
            : StepStatus.TODO
          : kit.failed
            ? StepStatus.UNKNOWN
            : StepStatus.CHECKING,
        actions: [
          {
            kind: ActionKind.PERFORM,
            // The same call the Voice input section's control makes, failure
            // reporting included. A global install can need elevation, and the
            // backend answers that with a command to run — dropping it here
            // would leave the spinner stopping and nothing else said (#298).
            run: () => runKitInstall(kit.install, 'installed'),
            running: kit.installing,
          },
        ],
      },
      {
        id: 'arrangeDock',
        status: settingsLoading
          ? StepStatus.CHECKING
          : dockArranged
            ? StepStatus.DONE
            : StepStatus.TODO,
        optional: true,
        actions: [{ kind: ActionKind.REVEAL, run: () => openDockEditor() }],
      },
    ];
  }, [
    cliQuery.isPending,
    cliQuery.isError,
    cliQuery.isFetching,
    cliQuery.data,
    recheckCli,
    account.data,
    account.isError,
    account.isFetching,
    kit.info,
    kit.failed,
    kit.installing,
    kit.install,
    settings,
    settingsLoading,
    refetchAuth,
    // Rebuilt whenever the route changes, and the fallback it records is the
    // route at the time it was made. Left out, the button would send the user
    // back to wherever they were when this list was last built.
    navigateToLogin,
  ]);

  /**
   * Every step is done, optional ones included.
   *
   * `DONE` only. A step still being checked, or one whose lookup came back
   * unanswered, is not a finished step.
   *
   * Nothing is gated on this and it closes nothing by itself. The card is closed
   * by the user pressing something, and this only decides whether one of the two
   * things to press is available yet.
   */
  const allDone = steps.every((step) => step.status === StepStatus.DONE);

  return {
    steps,
    dismissedAt: dismissedAtQuery.data,
    allDone,
    dismiss,
  };
}
