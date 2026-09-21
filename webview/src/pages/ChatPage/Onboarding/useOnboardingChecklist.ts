import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBridgeContext } from '@/contexts/BridgeContext';
import { useSettings } from '@/contexts/SettingsContext';
import { useAccountQuery } from '@/hooks/queries/useAccountQuery';
import { useExtendKit } from '@/hooks/queries/useExtendKit';
import { useNavigateToLogin } from '@/hooks';
import { openSettingsAt } from '@/utils/openSettingsAt';
import { runKitInstall } from '@/utils/runKitInstall';
import { Route } from '@/router';
import { MessageType } from '@/shared';
import { SettingKey } from '@/types/settings';
import { openDockEditor } from './openDockEditor';
import { isBlocking } from './isBlocking';
import { StepAction, StepStatus, type ChecklistStep } from './types';

export interface OnboardingChecklistState {
  steps: ChecklistStep[];
  /** The user closed the card. Read from the backend, so it survives a restart. */
  dismissed: boolean;
  /**
   * A required step is KNOWN to be unsatisfied.
   *
   * Deliberately narrower than "not all steps are done". `UNKNOWN` does not
   * raise the card and neither does `CHECKING`, because the card takes the
   * empty state over and turns the composer off — doing that to someone whose
   * setup is fine, on the strength of an answer we did not get, would be the
   * app breaking itself over its own uncertainty. An optional step never raises
   * it either; the dock being unarranged is not a reason to stop someone typing.
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

  const dismiss = useCallback(() => dismissMutation.mutate(), [dismissMutation]);

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
        // We cannot install it for them, but the CLI settings page is where a
        // `claude` in an unusual place is pointed at, which is the part of this
        // we can carry.
        action: StepAction.REVEAL,
        run: () => void openSettingsAt(Route.SETTINGS_CLI),
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
        action: StepAction.REVEAL,
        // The same entry point the auth banner and the inline CTA use. It is
        // the single one every "go to login" trigger is meant to share, because
        // it records where the user was as a `fallback` so finishing the login
        // returns them there — a jump straight to the account settings page
        // would drop that and leave them on settings afterwards. (#178)
        run: () => navigateToLogin(),
      },
      {
        id: 'installKit',
        status: kit.loading
          ? StepStatus.CHECKING
          : kit.info?.installed
            ? StepStatus.DONE
            : StepStatus.TODO,
        action: StepAction.PERFORM,
        running: kit.installing,
        // The same call the Voice input section's control makes, failure
        // reporting included. A global install can need elevation, and the
        // backend answers that with a command to run — dropping it here would
        // leave the spinner stopping and nothing else said (#298).
        run: () => runKitInstall(kit.install, 'installed'),
      },
      {
        id: 'arrangeDock',
        status: settingsLoading
          ? StepStatus.CHECKING
          : dockArranged
            ? StepStatus.DONE
            : StepStatus.TODO,
        action: StepAction.REVEAL,
        optional: true,
        run: () => openDockEditor(),
      },
    ];
  }, [
    cliQuery.isPending,
    cliQuery.isError,
    cliQuery.data,
    account.data,
    account.isError,
    kit.loading,
    kit.info?.installed,
    kit.installing,
    kit.install,
    settings,
    settingsLoading,
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
