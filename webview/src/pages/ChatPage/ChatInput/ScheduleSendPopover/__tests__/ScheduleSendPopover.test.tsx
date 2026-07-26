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
  SettingBadge: () => <span data-testid="sponsor-badge" />,
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
    const textarea = screen.getByLabelText('scheduleSend.messageLabel') as HTMLTextAreaElement;
    // The label wraps the textarea via <label>, so query by role instead if needed.
    expect(textarea?.value ?? screen.getByRole('textbox')).toBeTruthy();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(
      'keep refactoring the auth module',
    );
  });

  it('shows the Sponsor badge next to the title', () => {
    renderPopover();
    expect(screen.getByTestId('sponsor-badge')).toBeInTheDocument();
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
});
