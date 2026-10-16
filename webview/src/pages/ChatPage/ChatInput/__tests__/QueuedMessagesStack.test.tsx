import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { QueuedMessagesStack } from '../QueuedMessagesStack';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const entries = [
  { id: 'a', content: 'first', queuedAt: 0 },
  { id: 'b', content: 'second', queuedAt: 1 },
  { id: 'c', content: 'third', queuedAt: 2 },
];

function setup(list = entries) {
  const handlers = { onCancel: vi.fn(), onSteer: vi.fn(), onMergeWithNext: vi.fn(), onMove: vi.fn() };
  render(<QueuedMessagesStack entries={list} {...handlers} />);
  return handlers;
}
const bubble = (id: string) => screen.getByTestId(`queued-message-${id}`);

describe('QueuedMessagesStack toolbar', () => {
  it('offers only the moves that make sense at each position', () => {
    setup();
    expect(within(bubble('a')).queryByLabelText('chatInput.queuedMessages.moveUp')).toBeNull();
    expect(within(bubble('a')).getByLabelText('chatInput.queuedMessages.moveDown')).toBeTruthy();
    expect(within(bubble('c')).queryByLabelText('chatInput.queuedMessages.moveDown')).toBeNull();
    expect(within(bubble('b')).queryByText('chatInput.queuedMessages.merge')).toBeNull();
  });

  it('a single message can only be sent now or removed', () => {
    setup([entries[0]]);
    const labels = within(bubble('a')).getAllByRole('button')
      .map(b => b.getAttribute('aria-label'))
      .filter(l => l?.startsWith('chatInput.queuedMessages.'));
    expect(labels).toEqual(['chatInput.queuedMessages.steer', 'chatInput.queuedMessages.cancel']);
  });

  it('calls each handler with the entry id and target index', () => {
    const h = setup();
    fireEvent.click(within(bubble('b')).getByLabelText('chatInput.queuedMessages.steer'));
    fireEvent.click(within(bubble('b')).getByLabelText('chatInput.queuedMessages.moveUp'));
    fireEvent.click(within(bubble('b')).getByLabelText('chatInput.queuedMessages.moveDown'));
    fireEvent.click(within(bubble('b')).getByLabelText('chatInput.queuedMessages.cancel'));
    expect(h.onSteer).toHaveBeenCalledWith('b');
    expect(h.onMove).toHaveBeenNthCalledWith(1, 'b', 0);
    expect(h.onMove).toHaveBeenNthCalledWith(2, 'b', 2);
    expect(h.onCancel).toHaveBeenCalledWith('b');
  });
});

describe('QueuedMessagesStack merge buttons', () => {
  const mergeButtons = () => screen.getAllByRole('button', { name: 'chatInput.queuedMessages.merge' });

  it('puts one merge button between each pair of messages', () => {
    setup();
    expect(mergeButtons()).toHaveLength(2);
  });

  it('has no merge button for a single message', () => {
    setup([entries[0]]);
    expect(screen.queryByRole('button', { name: 'chatInput.queuedMessages.merge' })).toBeNull();
  });

  it('merges the message above the button into the one below it', () => {
    const h = setup();
    fireEvent.click(mergeButtons()[1]);
    expect(h.onMergeWithNext).toHaveBeenCalledWith('b');
  });

  it('outlines the two messages it would merge while hovered', () => {
    setup();
    const outlined = () => ['a', 'b', 'c'].filter(id => bubble(id).className.includes('ring-1'));
    fireEvent.mouseEnter(mergeButtons()[0]);
    expect(outlined()).toEqual(['a', 'b']);
    fireEvent.mouseLeave(mergeButtons()[0]);
    expect(outlined()).toEqual([]);
  });

  it('drops the outline once merged, since the clicked button goes away without a mouseleave', () => {
    setup();
    const outlined = () => ['a', 'b', 'c'].filter(id => bubble(id).className.includes('ring-1'));
    fireEvent.mouseEnter(mergeButtons()[0]);
    fireEvent.click(mergeButtons()[0]);
    expect(outlined()).toEqual([]);
  });
});
