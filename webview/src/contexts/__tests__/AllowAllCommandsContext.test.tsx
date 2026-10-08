import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { vi } from 'vitest';
import { AllowAllCommandsProvider, useAllowAllCommands } from '../AllowAllCommandsContext';

// What the provider reads from the session screen: which conversation is open.
// Set per case, then re-rendered.
let mockSessionId: string | null = null;
vi.mock('../SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: mockSessionId }),
}));

// What it reads from the settings: the stored default, which keys the project
// file carries, and the write that persists the default.
let mockSettings: Record<string, unknown> = {};
let mockOverrides: string[] = [];
const updateSettingWithScopeMock = vi.fn().mockResolvedValue(undefined);
vi.mock('../SettingsContext', () => ({
  useSettings: () => ({
    settings: mockSettings,
    overrides: mockOverrides,
    updateSettingWithScope: updateSettingWithScopeMock,
  }),
}));

// Whether the user is a sponsor, as the cached status says and as a fresh check
// says. They agree unless a case says otherwise.
let mockIsSponsor = true;
let mockSponsorLoading = false;
// What a fresh check says when it is meant to differ from the cached status.
let mockFreshSponsor: boolean | null = null;
vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({ isSponsor: mockIsSponsor, isLoading: mockSponsorLoading }),
}));
const followSponsorOfferMock = vi.fn();
vi.mock('@/utils/followSponsorOffer', () => ({
  followSponsorOffer: (...args: unknown[]) => followSponsorOfferMock(...args),
}));
const reportSponsorGateMock = vi.fn();
vi.mock('@/utils/reportSponsorGate', () => ({
  reportSponsorGate: (...args: unknown[]) => reportSponsorGateMock(...args),
}));
const ensureSponsorMock = vi.fn();
vi.mock('@/utils/ensureSponsor', () => ({
  ensureSponsor: (...args: unknown[]) => ensureSponsorMock(...args),
}));

type Api = ReturnType<typeof useAllowAllCommands>;
let api: Api;

function Probe() {
  api = useAllowAllCommands();
  return null;
}

function mount() {
  return render(
    <AllowAllCommandsProvider>
      <Probe />
    </AllowAllCommandsProvider>,
  );
}

function remountWith(view: ReturnType<typeof mount>) {
  view.rerender(
    <AllowAllCommandsProvider>
      <Probe />
    </AllowAllCommandsProvider>,
  );
}

beforeEach(() => {
  mockSessionId = null;
  mockSettings = {};
  mockOverrides = [];
  mockIsSponsor = true;
  mockSponsorLoading = false;
  mockFreshSponsor = null;
  updateSettingWithScopeMock.mockClear();
  followSponsorOfferMock.mockClear();
  reportSponsorGateMock.mockClear();
  ensureSponsorMock.mockReset();
  ensureSponsorMock.mockImplementation(async () => mockFreshSponsor ?? mockIsSponsor);
});

describe('AllowAllCommandsProvider — the warning', () => {
  it('turns it on for the open conversation only after the warning is confirmed', async () => {
    mockSessionId = 'session-1';
    mount();

    let result: Promise<boolean> | undefined;
    act(() => {
      result = api.requestEnable();
    });

    // Asked, not yet answered: nothing is on.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.isEnabled('session-1')).toBe(false);

    // The provider writes the session after the answer resolves, so the click
    // and the wait share one act.
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable' }));
      await result;
    });

    await expect(result).resolves.toBe(true);
    expect(api.isEnabled('session-1')).toBe(true);
    expect(api.isEnabled('session-2')).toBe(false);
  });

  it('leaves it off when the warning is cancelled', async () => {
    mockSessionId = 'session-1';
    mount();

    let result: Promise<boolean> | undefined;
    act(() => {
      result = api.requestEnable();
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await expect(result).resolves.toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.isEnabled('session-1')).toBe(false);
  });

  it('keeps the warning on screen as long as it is unanswered, outside whoever asked', () => {
    // The slash command panel unmounts on a mousedown outside itself; the
    // warning must not be a child of anything that does.
    mockSessionId = 'session-1';
    mount();

    act(() => {
      void api.requestEnable();
    });

    expect(api.confirmOpen).toBe(true);
  });
});

describe('AllowAllCommandsProvider — before the first message', () => {
  it('can be turned on while the conversation has no session yet', () => {
    mount();

    act(() => api.setEnabled(null, true));

    expect(api.isEnabled(null)).toBe(true);
  });

  it('hands that choice to the session the first message creates', () => {
    const view = mount();
    act(() => api.setEnabled(null, true));

    // The creator of the session hands it over, then the address follows.
    act(() => api.adoptDraft('brand-new'));
    mockSessionId = 'brand-new';
    remountWith(view);

    expect(api.isEnabled('brand-new')).toBe(true);
    expect(api.isEnabled(null)).toBe(false);
  });

  it('hands over nothing when nothing was chosen before the session existed', () => {
    mount();

    act(() => api.adoptDraft('brand-new'));

    expect(api.isEnabled('brand-new')).toBe(false);
  });

  it('does not hand it to an existing session opened from the empty screen', () => {
    // The choice was about a new conversation, and nothing adopted it.
    const view = mount();
    act(() => api.setEnabled(null, true));

    mockSessionId = 'old-one';
    remountWith(view);

    expect(api.isEnabled('old-one')).toBe(false);
    expect(api.isEnabled(null)).toBe(false);
  });

  it('starts a later new conversation with it off again', () => {
    const view = mount();
    act(() => api.setEnabled(null, true));
    act(() => api.adoptDraft('brand-new'));
    mockSessionId = 'brand-new';
    remountWith(view);

    mockSessionId = null;
    remountWith(view);

    expect(api.isEnabled(null)).toBe(false);
  });
});

const DEFAULT_KEY = 'allowAllCommandsByDefault';

/** Open the warning for the open conversation; read how it was answered later. */
function openWarning(): () => Promise<boolean> {
  let result: Promise<boolean> | undefined;
  act(() => {
    result = api.requestEnable();
  });
  return () => result as Promise<boolean>;
}

const dialog = () => screen.getByRole('dialog');
const allSessionsBox = () => within(dialog()).getByRole('checkbox') as HTMLInputElement;
const confirmEnable = () => fireEvent.click(within(dialog()).getByRole('button', { name: 'Enable' }));

// The answer settles asynchronously: the provider writes the session and the
// setting after the dialog resolves, so the click and the wait share one act.
async function confirmAndSettle(result: () => Promise<boolean>): Promise<void> {
  await act(async () => {
    confirmEnable();
    await result();
  });
}

async function cancelAndSettle(result: () => Promise<boolean>): Promise<void> {
  await act(async () => {
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    await result();
  });
}

// Checking the box asks the sponsor check first, so the box turns over later.
async function clickBox(): Promise<void> {
  await act(async () => {
    fireEvent.click(allSessionsBox());
  });
}

describe('AllowAllCommandsProvider — the default across sessions', () => {
  it('starts every session with it on when a sponsor has turned the default on', () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mount();

    expect(api.enabledByDefault).toBe(true);
    expect(api.isEnabled('any-session')).toBe(true);
    expect(api.isEnabled(null)).toBe(true);
  });

  it('lets one session turn the default off for itself without touching the others', () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mount();

    act(() => api.setEnabled('session-1', false));

    expect(api.isEnabled('session-1')).toBe(false);
    expect(api.isEnabled('session-2')).toBe(true);
  });

  it('lets the conversation with no session yet turn it off, and hands that to its session', () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mount();

    act(() => api.setEnabled(null, false));
    expect(api.isEnabled(null)).toBe(false);

    act(() => api.adoptDraft('brand-new'));
    expect(api.isEnabled('brand-new')).toBe(false);
  });

  it('reads as off once the sponsorship has lapsed, and keeps the stored value', () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mockIsSponsor = false;
    mount();

    expect(api.enabledByDefault).toBe(false);
    expect(api.isEnabled('any-session')).toBe(false);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
  });

  it('ignores a default that the project file supplies, since a cloned repo could ship it', () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mockOverrides = [DEFAULT_KEY];
    mount();

    expect(api.enabledByDefault).toBe(false);
    expect(api.isEnabled('any-session')).toBe(false);
  });

  it('turns the default off by writing it to the user settings', async () => {
    mount();

    await act(async () => api.disableByDefault());

    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(DEFAULT_KEY, false, 'global');
  });
});

describe('AllowAllCommandsProvider — the "all sessions" box in the warning', () => {
  it('explains the box under it, and keeps the message about this session alone', () => {
    mockSessionId = 'session-1';
    mount();
    openWarning();

    const box = allSessionsBox();
    const hint = within(dialog()).getByText(/Settings > Permissions/, { selector: 'p' });
    // The hint sits with the box, not in the message above it.
    expect(hint.parentElement).toBe(box.closest('label')?.parentElement);
    expect(hint).toHaveTextContent('Allow all command in all sessions');
    // The message's last paragraph is about the slash command panel only.
    const message = within(dialog()).getByText(/slash command panel/, { selector: 'p.whitespace-pre-line' });
    expect(message).not.toHaveTextContent('Settings > Permissions');
  });

  it('starts unchecked when the default is off', () => {
    mockSessionId = 'session-1';
    mount();
    openWarning();

    expect(allSessionsBox().checked).toBe(false);
  });

  it('starts checked when the default is on, so answering without touching it changes nothing', async () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    expect(allSessionsBox().checked).toBe(true);
    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
  });

  it('writes the default on when confirmed with the box checked', async () => {
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await clickBox();
    expect(allSessionsBox().checked).toBe(true);
    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(DEFAULT_KEY, true, 'global');
    expect(api.isEnabled('session-1')).toBe(true);
  });

  it('writes nothing when confirmed with the box unchecked and the default already off', async () => {
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(api.isEnabled('session-1')).toBe(true);
    expect(api.isEnabled('session-2')).toBe(false);
  });

  it('writes the default off when it was on and the box is cleared, keeping this session on', async () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await clickBox();
    expect(allSessionsBox().checked).toBe(false);
    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(DEFAULT_KEY, false, 'global');
    expect(api.isEnabled('session-1')).toBe(true);
  });

  it('turns this session on even after it was turned off while the default was on', async () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mockSessionId = 'session-1';
    mount();
    act(() => api.setEnabled('session-1', false));
    const result = openWarning();

    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(api.isEnabled('session-1')).toBe(true);
  });

  it('asks for the sponsor check when the box is checked, and not when it is cleared', async () => {
    mockSettings = { [DEFAULT_KEY]: true };
    mockSessionId = 'session-1';
    mount();
    openWarning();

    await clickBox();
    expect(ensureSponsorMock).not.toHaveBeenCalled();

    await clickBox();
    expect(ensureSponsorMock).toHaveBeenCalledTimes(1);
    expect(ensureSponsorMock).toHaveBeenCalledWith('allowallcommands', 'confirm_dialog');
  });

  it('refuses a tick that a fresh check turns down, though the cached status said sponsor', async () => {
    mockFreshSponsor = false;
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await clickBox();
    expect(ensureSponsorMock).toHaveBeenCalledTimes(1);
    expect(allSessionsBox().checked).toBe(false);

    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(api.isEnabled('session-1')).toBe(true);
  });

  it('writes nothing and turns nothing on when the warning is cancelled with the box checked', async () => {
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await clickBox();
    expect(allSessionsBox().checked).toBe(true);
    await cancelAndSettle(result);

    await expect(result()).resolves.toBe(false);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(api.isEnabled('session-1')).toBe(false);
  });
});

describe('AllowAllCommandsProvider — turning the default on from Settings', () => {
  async function openFromSettings(): Promise<() => Promise<boolean>> {
    let result: Promise<boolean> | undefined;
    await act(async () => {
      result = api.requestEnableByDefault();
      // Let the sponsor check resolve; the warning is drawn right after it.
      await Promise.resolve();
    });
    return () => result as Promise<boolean>;
  }

  it('turns a non-sponsor away before showing the warning', async () => {
    mockIsSponsor = false;
    mount();

    const result = await openFromSettings();

    await expect(result()).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(ensureSponsorMock).toHaveBeenCalledWith('allowallcommands', 'settings_toggle');
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
  });

  it('shows the all-sessions warning without a box, and writes the default once confirmed', async () => {
    mount();
    const result = await openFromSettings();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog()).getByText(/in all sessions\?/)).toBeInTheDocument();
    expect(within(dialog()).queryByRole('checkbox')).not.toBeInTheDocument();
    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(updateSettingWithScopeMock).toHaveBeenCalledWith(DEFAULT_KEY, true, 'global');
  });

  it('writes nothing when the warning is cancelled', async () => {
    mount();
    const result = await openFromSettings();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await cancelAndSettle(result);

    await expect(result()).resolves.toBe(false);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
  });
});

describe('AllowAllCommandsProvider — the box for someone who is not a sponsor', () => {
  const OFFER = ['allowallcommands', 'confirm_dialog'];

  it('shows the box, dimmed and unticked, instead of hiding it', () => {
    mockIsSponsor = false;
    mockSessionId = 'session-1';
    mount();
    openWarning();

    expect(api.sponsorLocked).toBe(true);
    expect(allSessionsBox().checked).toBe(false);
    expect(allSessionsBox()).toBeDisabled();
    expect(allSessionsBox().closest('label')).toHaveClass('opacity-60');
  });

  it('reports the offer as seen once, when the locked box is on screen', () => {
    mockIsSponsor = false;
    mockSessionId = 'session-1';
    mount();
    openWarning();

    expect(reportSponsorGateMock).toHaveBeenCalledTimes(1);
    expect(reportSponsorGateMock).toHaveBeenCalledWith(OFFER[0], 'seen', { from: OFFER[1] });
  });

  it('reports nothing and leaves the box open to a sponsor', () => {
    mockSessionId = 'session-1';
    mount();
    openWarning();

    expect(api.sponsorLocked).toBe(false);
    expect(allSessionsBox()).not.toBeDisabled();
    expect(reportSponsorGateMock).not.toHaveBeenCalled();
  });

  it('does not lock while the sponsor status is still loading, so a sponsor never sees the lock', () => {
    mockIsSponsor = false;
    mockSponsorLoading = true;
    mockSessionId = 'session-1';
    mount();
    openWarning();

    expect(api.sponsorLocked).toBe(false);
    expect(allSessionsBox()).not.toBeDisabled();
    expect(reportSponsorGateMock).not.toHaveBeenCalled();
  });

  it('leads to the Sponsor page when the label is pressed, and cancels the warning', async () => {
    mockIsSponsor = false;
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await act(async () => {
      fireEvent.click(within(dialog()).getByText('Enable in all sessions'));
      await result();
    });

    expect(followSponsorOfferMock).toHaveBeenCalledTimes(1);
    expect(followSponsorOfferMock).toHaveBeenCalledWith(OFFER[0], OFFER[1]);
    await expect(result()).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.isEnabled('session-1')).toBe(false);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
  });

  it('leads there once when the badge beside the label is pressed, since it is part of the label', async () => {
    mockIsSponsor = false;
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    const label = allSessionsBox().closest('label') as HTMLElement;
    await act(async () => {
      fireEvent.click(label.lastElementChild as HTMLElement);
      await result();
    });

    expect(followSponsorOfferMock).toHaveBeenCalledTimes(1);
    await expect(result()).resolves.toBe(false);
  });

  it('leaves the session switch free: confirming without the box still turns this session on', async () => {
    mockIsSponsor = false;
    mockSessionId = 'session-1';
    mount();
    const result = openWarning();

    await confirmAndSettle(result);

    await expect(result()).resolves.toBe(true);
    expect(api.isEnabled('session-1')).toBe(true);
    expect(updateSettingWithScopeMock).not.toHaveBeenCalled();
    expect(followSponsorOfferMock).not.toHaveBeenCalled();
  });
});
