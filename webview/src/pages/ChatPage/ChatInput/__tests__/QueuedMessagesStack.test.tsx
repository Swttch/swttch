import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueuedMessagesStack } from '../QueuedMessagesStack';
import { useQueuedMessageDrag } from '../useQueuedMessageDrag';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../useQueuedMessageDrag', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../useQueuedMessageDrag')>();
  return { ...actual, useQueuedMessageDrag: vi.fn(actual.useQueuedMessageDrag) };
});

const messages = [
  { id: 'a', content: 'first', queuedAt: 0 },
  { id: 'b', content: 'second', queuedAt: 1 },
  { id: 'c', content: 'third', queuedAt: 2 },
];

function setup(list = messages) {
  const handlers = { onCancel: vi.fn(), onSteer: vi.fn(), onMerge: vi.fn(), onMove: vi.fn() };
  render(<QueuedMessagesStack messages={list} {...handlers} />);
  return handlers;
}
const bubble = (id: string) => screen.getByTestId(`queued-message-${id}`);

/** Pretend a drag is in flight, since jsdom cannot drive the drag layer's pointer. */
function dragging(state: { draggingId: string; mergeTargetId?: string | null; orderedIds?: string[] }) {
  vi.mocked(useQueuedMessageDrag).mockReturnValue({
    orderedIds: state.orderedIds ?? messages.map(m => m.id),
    draggingId: state.draggingId,
    mergeTargetId: state.mergeTargetId ?? null,
    start: vi.fn(),
    hover: vi.fn(),
    hoverGap: vi.fn(),
    drop: vi.fn(),
    cancel: vi.fn(),
  });
}

describe('QueuedMessagesStack icons', () => {
  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('../useQueuedMessageDrag')>('../useQueuedMessageDrag');
    vi.mocked(useQueuedMessageDrag).mockImplementation(actual.useQueuedMessageDrag);
  });

  it('gives every message the same two icons, even a single one', () => {
    setup([messages[0]]);
    const labels = within(bubble('a')).getAllByRole('button')
      .map(b => b.getAttribute('aria-label'))
      .filter(l => l?.startsWith('chatInput.queuedMessages.'));
    expect(labels).toEqual(['chatInput.queuedMessages.steer', 'chatInput.queuedMessages.remove']);
  });

  it('calls each handler with the message id', () => {
    const h = setup();
    fireEvent.click(within(bubble('b')).getByLabelText('chatInput.queuedMessages.steer'));
    fireEvent.click(within(bubble('b')).getByLabelText('chatInput.queuedMessages.remove'));
    expect(h.onSteer).toHaveBeenCalledWith('b');
    expect(h.onCancel).toHaveBeenCalledWith('b');
  });

  it('does not expand the bubble when an icon is clicked', () => {
    setup();
    fireEvent.click(within(bubble('a')).getByLabelText('chatInput.queuedMessages.steer'));
    const box = bubble('a').querySelector('[data-message-box]');
    expect(box?.className).toContain('max-h-[28px]');
  });
});

describe('QueuedMessagesStack while dragging', () => {
  // Moving the held message's element in the page makes the drag layer lose the copy under the pointer.
  it('shows a previewed order without moving any message in the page', () => {
    dragging({ draggingId: 'c', orderedIds: ['c', 'a', 'b'] });
    setup();
    const slots = [...document.querySelectorAll<HTMLElement>('[data-queued-slot]')];
    const idOf = (slot: HTMLElement) => slot.querySelector('[data-testid^="queued-message-"]')?.getAttribute('data-testid');
    expect(slots.map(idOf)).toEqual(['queued-message-a', 'queued-message-b', 'queued-message-c']);
    expect(slots.map(slot => slot.style.order)).toEqual(['1', '2', '0']);
  });

  it('keeps every message fanned out', () => {
    dragging({ draggingId: 'c' });
    setup();
    for (const id of ['b', 'c']) {
      const slot = bubble(id).closest('[data-queued-slot]') as HTMLElement;
      expect(slot.className.split(' ')).not.toContain('absolute');
    }
  });

  it('hides the count badge', () => {
    dragging({ draggingId: 'c' });
    setup();
    expect(screen.getByTestId('queued-messages-count').className.split(' ')).toContain('opacity-0');
  });

  it('outlines the merge target and labels it', () => {
    dragging({ draggingId: 'c', mergeTargetId: 'a' });
    setup();
    expect(bubble('a').className).toContain('ring-1');
    expect(within(bubble('a')).getByText('chatInput.queuedMessages.mergePreview')).toBeTruthy();
    expect(bubble('b').className).not.toContain('ring-1');
  });
});
