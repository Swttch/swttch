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

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enable' }));

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
