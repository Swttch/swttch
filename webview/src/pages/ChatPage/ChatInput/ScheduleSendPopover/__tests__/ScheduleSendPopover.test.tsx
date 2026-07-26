import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MessageType, ScheduledMessageKind } from '@/shared';

// ---------------------------------------------------------------------------
// Mutable context read by the mocked hooks.
// ---------------------------------------------------------------------------
const ctx = {
  sessionId: 'sess-a' as string | null,
  draft: '',
};

const sendMock = vi.fn((_type: string, _payload?: Record<string, unknown>) => Promise.resolve({}));
const onCloseMock = vi.fn();
const { ensureSponsorMock, toastSuccessMock } = vi.hoisted(() => ({
  ensureSponsorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({ send: sendMock }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: ctx.sessionId }),
}));
vi.mock('@/contexts/ChatInputStateContext', () => ({
  useChatInputState: () => ({ input: ctx.draft, setInput: vi.fn() }),
}));
vi.mock('@/utils/ensureSponsor', () => ({ ensureSponsor: ensureSponsorMock }));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// The Sponsor badge is exercised in its own tests; stub it here so this suite
// doesn't pull in the Tippy tooltip runtime.
vi.mock('@/components', () => ({
  // Render the tooltip override so the test can assert the softer wording is
  // passed through (the real badge shows it inside a Tippy tooltip).
  SettingBadge: ({ tooltipOverride }: { tooltipOverride?: string }) => (
    <span data-testid="sponsor-badge" data-tooltip={tooltipOverride} />
  ),
  SettingBadgeVariant: { Sponsor: 'sponsor', ClaudeNative: 'claudeNative' },
}));
vi.mock('react-hot-toast', () => ({
  default: { success: toastSuccessMock },
}));

import { ScheduleSendPopover } from '../index';

function renderPopover() {
  return render(<ScheduleSendPopover onClose={onCloseMock} />);
}

beforeEach(() => {
  sendMock.mockClear();
  onCloseMock.mockClear();
  ensureSponsorMock.mockReset();
  toastSuccessMock.mockClear();
  ctx.sessionId = 'sess-a';
  ctx.draft = '';
  ensureSponsorMock.mockResolvedValue(true);
});

describe('ScheduleSendPopover', () => {
  it('pre-fills the message box from the composer draft', () => {
    ctx.draft = 'keep refactoring the auth module';
    renderPopover();
    // The message box is a RichInput (contentEditable div, role=textbox), so the
    // seeded text lives in textContent, not a .value property.
    expect(screen.getByRole('textbox').textContent).toBe('keep refactoring the auth module');
  });

  it('shows the Sponsor badge with the softer "for sponsors" tooltip override', () => {
    renderPopover();
    const badge = screen.getByTestId('sponsor-badge');
    expect(badge).toBeInTheDocument();
    // The popover overrides the shared "sponsor-only feature" wording.
    expect(badge).toHaveAttribute('data-tooltip', 'scheduleSend.sponsorTooltip');
  });

  it('focuses the message box on open', () => {
    ctx.draft = 'continue';
    renderPopover();
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  });

  it('closes on Escape', () => {
    renderPopover();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('sponsor submit sends SCHEDULE_MESSAGE with kind USER_SCHEDULED and closes', async () => {
    ctx.draft = 'continue';
    renderPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('scheduleSend.submit'));
    });
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const [type, payload] = sendMock.mock.calls[0];
    const p = payload!;
    expect(type).toBe(MessageType.SCHEDULE_MESSAGE);
    expect(p.sessionId).toBe('sess-a');
    expect(p.message).toBe('continue');
    expect(p.kind).toBe(ScheduledMessageKind.USER_SCHEDULED);
    expect(typeof p.sendAt).toBe('string');
    expect(Number.isNaN(Date.parse(p.sendAt as string))).toBe(false);
    expect(toastSuccessMock).toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('non-sponsor submit is gated: ensureSponsor runs but no message is sent', async () => {
    ensureSponsorMock.mockResolvedValue(false);
    ctx.draft = 'continue';
    renderPopover();
    await act(async () => {
      fireEvent.click(screen.getByText('scheduleSend.submit'));
    });
    await waitFor(() => expect(ensureSponsorMock).toHaveBeenCalled());
    expect(sendMock).not.toHaveBeenCalled();
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('disables submit when the message is empty', () => {
    ctx.draft = '';
    renderPopover();
    expect(screen.getByText('scheduleSend.submit').closest('button')).toBeDisabled();
  });

  it('disables submit when there is no active session', () => {
    ctx.sessionId = null;
    ctx.draft = 'continue';
    renderPopover();
    expect(screen.getByText('scheduleSend.submit').closest('button')).toBeDisabled();
  });

  it('closes when the X button is clicked', () => {
    renderPopover();
    fireEvent.click(screen.getByLabelText('scheduleSend.close'));
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('reveals day/hour/min/sec fields when the "after duration" option is chosen', () => {
    ctx.draft = 'continue';
    renderPopover();
    // Open the preset dropdown and pick "after a duration".
    fireEvent.click(screen.getByRole('button', { name: 'scheduleSend.whenLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'scheduleSend.presets.afterDuration' }));
    // All four unit inputs are now present.
    expect(screen.getByLabelText('scheduleSend.duration.days')).toBeInTheDocument();
    expect(screen.getByLabelText('scheduleSend.duration.hours')).toBeInTheDocument();
    expect(screen.getByLabelText('scheduleSend.duration.minutes')).toBeInTheDocument();
    expect(screen.getByLabelText('scheduleSend.duration.seconds')).toBeInTheDocument();
  });

  it('after-duration submit sends a sendAt in the future (now + duration)', async () => {
    ctx.draft = 'continue';
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'scheduleSend.whenLabel' }));
    fireEvent.click(screen.getByRole('option', { name: 'scheduleSend.presets.afterDuration' }));
    // Dial in 2 minutes (defaults seed hours=1, so this is well in the future).
    fireEvent.change(screen.getByLabelText('scheduleSend.duration.minutes'), { target: { value: '2' } });
    const before = Date.now();
    await act(async () => {
      fireEvent.click(screen.getByText('scheduleSend.submit'));
    });
    await waitFor(() => expect(sendMock).toHaveBeenCalled());
    const p = sendMock.mock.calls[0][1]!;
    expect(p.kind).toBe(ScheduledMessageKind.USER_SCHEDULED);
    expect(Date.parse(p.sendAt as string)).toBeGreaterThan(before);
  });

  it('does NOT close when a mousedown lands inside the preset Select listbox', () => {
    // Regression: the Select renders its options through a Portal into
    // document.body — outside the popover's panelRef. A mousedown on an option
    // used to register as an outside click and close the popover mid-selection.
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'scheduleSend.whenLabel' }));
    const option = screen.getByRole('option', { name: 'scheduleSend.presets.afterDuration' });
    fireEvent.mouseDown(option);
    expect(onCloseMock).not.toHaveBeenCalled();
  });

  it('DOES close on a mousedown truly outside the popover and the listbox', () => {
    renderPopover();
    fireEvent.mouseDown(document.body);
    expect(onCloseMock).toHaveBeenCalled();
  });
});
