import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageType } from '@/shared';
import { SettingKey } from '@/types/settings';
import { StepStatus, type ChecklistStep } from '../types';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

/** When the backend says the card was closed, or null if it never was. */
let storedDismissedAt: string | null = null;
/** What `claude` was found at, or null when the lookup found nothing. */
let cliPath: string | null = '/usr/local/bin/claude';

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ isConnected: true, send: mockSend, subscribe: vi.fn(), lastError: null }),
}));

const refetchAuth = vi.fn();
vi.mock('@/contexts', () => ({
  useAuthContext: () => ({ refetch: refetchAuth }),
}));

/**
 * The dock as the settings report it. Arranged by default, so "every step done"
 * is reachable — `allDone` counts the optional steps too, and the dock is one.
 */
let settings: Record<string, unknown> = {
  [SettingKey.DOCK_LAYOUT]: { order: ['chat'], visible: ['chat'] },
};
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings, isLoading: false }),
}));

/** The account answer, in the three shapes `useAccountQuery` can produce. */
let account: { data?: { loggedIn: boolean }; isError: boolean; isFetching: boolean } = {
  data: { loggedIn: true },
  isError: false,
  isFetching: false,
};
vi.mock('@/hooks/queries/useAccountQuery', () => ({
  useAccountQuery: () => account,
}));

/** The kit answer, in the three shapes `useExtendKit` can produce. */
let kit: { info?: { installed: string | null }; failed: boolean } = {
  info: { installed: '0.5.0' },
  failed: false,
};
vi.mock('@/hooks/queries/useExtendKit', () => ({
  useExtendKit: () => ({ ...kit, loading: false, installing: false, install: vi.fn() }),
}));

vi.mock('@/hooks', () => ({
  useNavigateToLogin: () => vi.fn(),
}));

vi.mock('@/utils/runKitInstall', () => ({
  runKitInstall: vi.fn(),
}));

import { useOnboardingChecklist, type OnboardingChecklistState } from '../useOnboardingChecklist';

let current: OnboardingChecklistState | null = null;
function Probe() {
  current = useOnboardingChecklist();
  return null;
}

function renderChecklist() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { staleTime: Infinity, gcTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <Probe />
    </QueryClientProvider>,
  );
}

const statusOf = (id: string): StepStatus | undefined =>
  current?.steps.find((s: ChecklistStep) => s.id === id)?.status;

const stepNamed = (id: string): ChecklistStep | undefined =>
  current?.steps.find((s: ChecklistStep) => s.id === id);

/** Every DISMISS_ONBOARDING that went out. */
const dismissWrites = () =>
  mockSend.mock.calls.filter((c) => c[0] === MessageType.DISMISS_ONBOARDING);

/**
 * The card is a once-per-install thing, and exactly one fact decides whether it
 * is raised: whether it has ever been closed.
 *
 * How far the steps got does not enter into that, and these cases exist to keep
 * it that way. #482 was a user who had installed the CLI, signed in and been
 * chatting for weeks opening a project to find the message box greyed out,
 * because the steps were being re-judged on every launch and one answer came
 * back wrong.
 */
describe('useOnboardingChecklist', () => {
  beforeEach(() => {
    mockSend.mockReset();
    current = null;
    storedDismissedAt = null;
    cliPath = '/usr/local/bin/claude';
    account = { data: { loggedIn: true }, isError: false, isFetching: false };
    kit = { info: { installed: '0.5.0' }, failed: false };
    settings = { [SettingKey.DOCK_LAYOUT]: { order: ['chat'], visible: ['chat'] } };

    mockSend.mockImplementation(async (type: string) => {
      if (type === MessageType.GET_ONBOARDING_DISMISSED_AT) {
        return { dismissedAt: storedDismissedAt };
      }
      if (type === MessageType.DISMISS_ONBOARDING) {
        storedDismissedAt = '2026-02-03T04:05:06.000Z';
        return { dismissedAt: storedDismissedAt };
      }
      if (type === MessageType.GET_DETECTED_CLI_PATH) return { path: cliPath };
      return {};
    });
  });

  it('reports the card as never closed when the backend has no record', async () => {
    renderChecklist();

    await waitFor(() => expect(current?.dismissedAt).toBeNull());
  });

  it('reports the recorded moment once the card has been closed', async () => {
    storedDismissedAt = '2026-01-01T00:00:00.000Z';
    renderChecklist();

    await waitFor(() => expect(current?.dismissedAt).toBe('2026-01-01T00:00:00.000Z'));
  });

  it('never records anything on its own, however complete the checklist is', async () => {
    // Every step satisfied. The card still waits to be closed by hand: finishing
    // the list lights the button up, it does not press it.
    renderChecklist();

    await waitFor(() => expect(current?.allDone).toBe(true));
    // Settle past the renders that a self-firing effect would show itself in.
    await new Promise((r) => setTimeout(r, 200));
    expect(dismissWrites()).toEqual([]);
    expect(current?.dismissedAt).toBeNull();
  });

  it('records the moment when the card is closed, and only then', async () => {
    renderChecklist();

    await waitFor(() => expect(current?.dismissedAt).toBeNull());
    current!.dismiss();

    await waitFor(() => expect(dismissWrites().length).toBe(1));
    // Closing carries no payload: it is one act with one meaning, and the moment
    // is the backend's to read.
    expect(dismissWrites()[0][1]).toBeUndefined();
    await waitFor(() => expect(current?.dismissedAt).toBe('2026-02-03T04:05:06.000Z'));
  });

  it('closes on an unfinished checklist just as readily', async () => {
    // Closing is available at any time and means the same thing either way. A
    // card closed with nothing done is just as closed as one closed with
    // everything done.
    cliPath = null;
    account = { data: { loggedIn: false }, isError: false, isFetching: false };
    renderChecklist();

    await waitFor(() => expect(current?.allDone).toBe(false));
    current!.dismiss();

    await waitFor(() => expect(dismissWrites().length).toBe(1));
    await waitFor(() => expect(current?.dismissedAt).not.toBeNull());
  });

  it('holds "all done" back until every step is actually done', async () => {
    account = { data: { loggedIn: false }, isError: false, isFetching: false };
    renderChecklist();

    await waitFor(() => expect(statusOf('signIn')).toBe(StepStatus.TODO));
    expect(current?.allDone).toBe(false);
  });

  it('counts the optional steps too, so "every step" means every step', async () => {
    // The dock is optional in the sense that nothing is gated on it, not in the
    // sense that "Get started" stops waiting for it. Skipping it is what the
    // close button is for.
    settings = {};
    renderChecklist();

    await waitFor(() => expect(statusOf('arrangeDock')).toBe(StepStatus.TODO));
    expect(current?.allDone).toBe(false);
  });

  it('does not count an unanswered lookup as a finished step', async () => {
    // An answer that never came back is not a step that is done. Counted as one,
    // the button would say the machine is ready on the strength of a failed
    // lookup.
    account = { data: undefined, isError: true, isFetching: false };
    renderChecklist();

    await waitFor(() => expect(statusOf('signIn')).toBe(StepStatus.UNKNOWN));
    expect(current?.allDone).toBe(false);
  });

  it('does not read a kit lookup that failed as a kit that is missing', async () => {
    // Two different facts that both leave the version empty. Drawn the same, the
    // card would tell someone to install a package they already have.
    kit = { info: undefined, failed: true };
    renderChecklist();

    await waitFor(() => expect(statusOf('installKit')).toBe(StepStatus.UNKNOWN));
  });

  it('keeps the extend kit optional', async () => {
    // The kit carries dictation, the usage panel and account switching. A prompt
    // goes through none of them.
    kit = { info: { installed: null }, failed: false };
    renderChecklist();

    await waitFor(() => expect(statusOf('installKit')).toBe(StepStatus.TODO));
    expect(stepNamed('installKit')?.optional).toBe(true);
  });
});
