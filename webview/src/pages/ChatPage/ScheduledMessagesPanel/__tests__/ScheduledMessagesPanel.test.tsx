import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScheduledMessageKind, type ScheduledMessage } from '@/shared';

// ── Mutable context read by the mocked hook ──────────────────────────────────
const state = {
  reservations: [] as ScheduledMessage[],
  panelOpen: true,
};
const openPanel = vi.fn();
const closePanel = vi.fn();
const cancel = vi.fn();
const startEdit = vi.fn();
const stopEdit = vi.fn();

vi.mock('@/contexts/ScheduledMessagesContext', () => ({
  useScheduledMessages: () => ({
    reservations: state.reservations,
    panelOpen: state.panelOpen,
    openPanel,
    closePanel,
    cancel,
    editing: null,
    startEdit,
    stopEdit,
  }),
}));
vi.mock('@/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// The edit overlay pulls in the popover (many contexts); stub it out — this
// suite covers the panel/button, not the popover internals.
vi.mock('../../ChatInput/ScheduleSendPopover', () => ({
  ScheduleSendPopover: () => <div data-testid="edit-popover" />,
}));

import { ScheduledMessagesPanel } from '../index';
import { ScheduledMessagesButton } from '../../SessionHeader/ScheduledMessagesButton';

function res(id: string, kind = ScheduledMessageKind.USER_SCHEDULED): ScheduledMessage {
  return {
    id,
    sessionId: 'sess-a',
    sendAt: '2031-01-01T09:30:00.000Z',
    message: `message ${id}`,
    kind,
    createdAt: '2030-12-31T00:00:00.000Z',
  };
}

beforeEach(() => {
  state.reservations = [];
  state.panelOpen = true;
  openPanel.mockClear();
  closePanel.mockClear();
  cancel.mockClear();
  startEdit.mockClear();
  stopEdit.mockClear();
});

describe('ScheduledMessagesButton', () => {
  it('renders nothing when there are no reservations', () => {
    state.reservations = [];
    const { container } = render(<ScheduledMessagesButton />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a count badge and opens the panel on click', () => {
    state.reservations = [res('r1'), res('r2')];
    state.panelOpen = false;
    render(<ScheduledMessagesButton />);
    expect(screen.getByText('2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(openPanel).toHaveBeenCalled();
  });
});

describe('ScheduledMessagesPanel', () => {
  it('renders nothing when the panel is closed', () => {
    state.panelOpen = false;
    state.reservations = [res('r1')];
    const { container } = render(<ScheduledMessagesPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the empty state when there are no reservations', () => {
    state.reservations = [];
    render(<ScheduledMessagesPanel />);
    expect(screen.getByText('scheduledMessages.empty')).toBeInTheDocument();
  });

  it('lists reservations with their message text', () => {
    state.reservations = [res('r1'), res('r2')];
    render(<ScheduledMessagesPanel />);
    expect(screen.getByText('message r1')).toBeInTheDocument();
    expect(screen.getByText('message r2')).toBeInTheDocument();
  });

  it('Edit starts editing; Cancel cancels the reservation (USER_SCHEDULED)', () => {
    state.reservations = [res('r1')];
    render(<ScheduledMessagesPanel />);
    fireEvent.click(screen.getByTitle('scheduledMessages.edit'));
    expect(startEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1' }));
    fireEvent.click(screen.getByTitle('scheduledMessages.cancel'));
    expect(cancel).toHaveBeenCalledWith('r1');
  });

  it('hides Edit for AUTO_RESUME reservations (managed by the limit banner)', () => {
    state.reservations = [res('ar', ScheduledMessageKind.AUTO_RESUME)];
    render(<ScheduledMessagesPanel />);
    expect(screen.queryByTitle('scheduledMessages.edit')).toBeNull();
    // Cancel is still available.
    expect(screen.getByTitle('scheduledMessages.cancel')).toBeInTheDocument();
  });

  it('sorts reservations by soonest send time first', () => {
    const at = (id: string, iso: string): ScheduledMessage => ({ ...res(id), sendAt: iso });
    // Provided out of order; the panel should render them ascending by sendAt.
    state.reservations = [
      at('late', '2031-03-01T00:00:00.000Z'),
      at('soon', '2031-01-01T00:00:00.000Z'),
      at('mid', '2031-02-01T00:00:00.000Z'),
    ];
    render(<ScheduledMessagesPanel />);
    const order = screen.getAllByText(/^message (soon|mid|late)$/).map((el) => el.textContent);
    expect(order).toEqual(['message soon', 'message mid', 'message late']);
  });

  it('toggles the full message when the message text is clicked', () => {
    state.reservations = [res('r1')];
    render(<ScheduledMessagesPanel />);
    const msg = screen.getByText('message r1');
    // Collapsed by default (3-line clamp class present).
    expect(msg.className).toContain('line-clamp-3');
    fireEvent.click(msg);
    expect(msg.className).not.toContain('line-clamp-3');
    fireEvent.click(msg);
    expect(msg.className).toContain('line-clamp-3');
  });
});
