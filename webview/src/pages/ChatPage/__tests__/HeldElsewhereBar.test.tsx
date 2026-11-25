import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

const send = vi.fn();
vi.mock('@/hooks/useBridge', () => ({ useBridge: () => ({ send, subscribe: vi.fn(() => () => undefined) }) }));
vi.mock('@/hooks/useEscapeLayer', () => ({ useEscapeLayer: () => undefined }));
vi.mock('@/contexts/SessionContext', () => ({ useSessionContext: () => ({ requestedInputMode: 'default' }) }));
vi.mock('@/contexts/ChatStreamContext', () => ({ useChatStreamContextOrNull: () => ({ sessionModel: 'sonnet' }) }));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
}));

import { HeldElsewhereBar, HeldElsewhereInputSlot } from '../HeldElsewhereBar';

const holder = (activity: string) => ({ holder: { activity, workingDir: '/held/folder', ownerPid: 4242 } });

/** Replies to GET_SESSION_HOLDER with the activity given; TAKE_OVER_SESSION is answered by `takeOver`. */
function bridgeSays(activity: string, takeOver: () => Promise<unknown> = async () => ({ status: 'ok' })) {
  send.mockImplementation(async (type: string) => {
    if (type === MessageType.GET_SESSION_HOLDER) return holder(activity);
    if (type === MessageType.TAKE_OVER_SESSION) return takeOver();
    return { status: 'ok' };
  });
}
const openDialog = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'takeOver.button' }));
  await screen.findByRole('dialog');
};

// Another backend holds the session: the input is covered, and taking the session over is asked before it is done.
describe('HeldElsewhereBar', () => {
  beforeEach(() => send.mockReset());

  it('says another backend runs the session, and asks before taking it over', async () => {
    bridgeSays('idle');
    render(<HeldElsewhereBar sessionId="s1" />);
    expect(screen.getByText('takeOver.message')).toBeInTheDocument();
    await openDialog();
    // nothing happens on the click of the bar's button alone
    expect(send).not.toHaveBeenCalledWith(MessageType.TAKE_OVER_SESSION, expect.anything(), expect.anything());
    expect(await screen.findByText('takeOver.dialogIdle')).toBeInTheDocument();
    // which backend it is: the folder it works in and its process
    expect(screen.getByTestId('take-over-holder-detail').textContent).toContain('/held/folder');
    expect(screen.getByTestId('take-over-holder-detail').textContent).toContain('4242');
  });

  it('offers one way to take over a holder at rest', async () => {
    bridgeSays('idle');
    render(<HeldElsewhereBar sessionId="s1" />);
    await openDialog();
    await screen.findByText('takeOver.dialogIdle');
    expect(screen.queryByRole('button', { name: 'takeOver.dialogAfterTurn' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'takeOver.dialogConfirm' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'now', inputMode: 'default', model: 'sonnet' }, { timeout: null }));
  });

  it('offers to interrupt or to wait for a holder at work', async () => {
    // the take-over stays pending: the holder's turn has not ended
    bridgeSays('running', () => new Promise(() => undefined));
    render(<HeldElsewhereBar sessionId="s1" />);
    await openDialog();
    expect(await screen.findByText('takeOver.dialogRunning')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'takeOver.dialogAfterTurn' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(MessageType.TAKE_OVER_SESSION, { sessionId: 's1', mode: 'afterTurn', inputMode: 'default', model: 'sonnet' }, { timeout: null }));
    // the wait can be given up
    expect(await screen.findByText('takeOver.waiting')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'takeOver.cancelWait' }));
    expect(send).toHaveBeenCalledWith(MessageType.CANCEL_TAKE_OVER_SESSION, { sessionId: 's1' });
  });

  it('does not offer to wait for a holder that waits for an answer: its turn ends only when someone answers there', async () => {
    bridgeSays('awaiting');
    render(<HeldElsewhereBar sessionId="s1" />);
    await openDialog();
    expect(await screen.findByText('takeOver.dialogAwaiting')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'takeOver.dialogAfterTurn' })).toBeNull();
    expect(screen.getByRole('button', { name: 'takeOver.dialogConfirm' })).toBeInTheDocument();
  });

  it('takes nothing over when the question is cancelled', async () => {
    bridgeSays('idle');
    render(<HeldElsewhereBar sessionId="s1" />);
    await openDialog();
    await screen.findByText('takeOver.dialogIdle');
    fireEvent.click(screen.getByRole('button', { name: 'takeOver.dialogCancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(send).not.toHaveBeenCalledWith(MessageType.TAKE_OVER_SESSION, expect.anything(), expect.anything());
  });

  it('says so on the bar when the take-over fails, and lets the person try again', async () => {
    bridgeSays('idle', async () => ({ status: 'error', error: 'holderUnreachable' }));
    render(<HeldElsewhereBar sessionId="s1" />);
    await openDialog();
    await screen.findByText('takeOver.dialogIdle');
    fireEvent.click(screen.getByRole('button', { name: 'takeOver.dialogConfirm' }));
    expect(await screen.findByText('takeOver.failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'takeOver.button' })).not.toBeDisabled();
  });
});

describe('HeldElsewhereInputSlot', () => {
  it('keeps the input where it is, hidden and shut to the keyboard, with the bar laid over it', () => {
    render(
      <HeldElsewhereInputSlot sessionId="s1">
        <input data-testid="chat-input" />
      </HeldElsewhereInputSlot>,
    );
    const input = screen.getByTestId('chat-input');
    const hidden = input.parentElement as HTMLElement;
    expect(hidden.className).toContain('invisible');
    expect(hidden).toHaveAttribute('inert');
    expect(screen.getByTestId('held-elsewhere-bar').className).toContain('absolute inset-0');
  });
});
