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
import { isBlocking } from './isBlocking';
import { ActionKind, StepStatus, type ChecklistStep } from './types';

export interface OnboardingChecklistState {
  steps: ChecklistStep[];
  /** The user closed the card. Read from the backend, so it survives a restart. */
  dismissed: boolean;
  /**
   * A required step is KNOWN to be unsatisfied.
   *
   * Deliberately narrower than "not all steps are done" — see {@link isBlocking}.
   */
  blocking: boolean;
  dismiss: () => void;
}

/**
 * The four things that have to be true before the chat can do anything, and how
 * far along this machine is.
 *
 * Every status is asked for fresh. None of it is recorded, because none of it is
 * history — the kit can be removed in a terminal and the CLI can be signed out
 * between two launches, and a remembered "installed" would then be the app
 * telling the user something that stopped being true. The one thing that IS
 * recorded is the dismissal, and that lives in `~/.claude-code-gui/profile.json`
 * rather than the webview: a JetBrains webview is served from a new origin on
 * every launch, so anything kept on the page starts empty after a restart and
 * the close button would only hold until the IDE was reopened (#453).
 *
 * Every check is the one the rest of the app already uses, not a second opinion:
 * the account query behind AuthContext, the kit query behind the Voice input
 * section, the same settings value the dock editor writes. Two answers to one
 * question is a bug waiting for the day they disagree.
 */
export function useOnboardingChecklist(): OnboardingChecklistState {
  const { isConnected, send } = useBridgeContext();
  const queryClient = useQueryClient();

  const dismissedQuery = useQuery<boolean, Error>({
    queryKey: [MessageType.GET_ONBOARDING_DISMISSED],
    enabled: isConnected,
    queryFn: async () => {
      const r = (await send(MessageType.GET_ONBOARDING_DISMISSED)) as { dismissed?: unknown };
      return r?.dismissed === true;
    },
  });

  const dismissMutation = useMutation<boolean, Error, void>({
    mutationFn: async () => {
      const r = (await send(MessageType.SET_ONBOARDING_DISMISSED, { dismissed: true })) as {
        dismissed?: unknown;
      };
      return r?.dismissed === true;
    },
    // Close on the click, not on the round trip. The record has to reach disk to
    // survive a restart, but the user asking for the card to go is not waiting
    // on that.
    onMutate: () => {
      queryClient.setQueryData([MessageType.GET_ONBOARDING_DISMISSED], true);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: [MessageType.GET_ONBOARDING_DISMISSED] });
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
        status: kit.loading
          ? StepStatus.CHECKING
          : kit.info?.installed
            ? StepStatus.DONE
            : StepStatus.TODO,
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
    kit.loading,
    kit.info?.installed,
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

  return {
    steps,
    dismissed: dismissedQuery.data === true,
    blocking: isBlocking(steps),
    dismiss,
  };
}
