import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@/i18n/config';
import { emptyContent, type ComposerContent } from '@/shared';
import { HistoryModal } from '../HistoryModal';
import type { SendIndexEntry } from '../../sendList';

const written = (text: string): ComposerContent => ({ ...emptyContent(), text });
const entry = (key: string, text: string, images = 0): SendIndexEntry => ({ key, recordId: key, text, images, loaded: false });

function show(props: Partial<React.ComponentProps<typeof HistoryModal>> = {}) {
  const calls = { onRecall: vi.fn(), onRevert: vi.fn(), onClose: vi.fn(), loadContent: vi.fn(async (key: string) => written(`all of ${key}`)) };
  const view = render(
    <HistoryModal
      entries={[entry('u1', 'oldest'), entry('u2', 'middle'), entry('u3', '', 1)]}
      edits={{ u2: written('middle, changed') }}
      currentKey={null}
      pictureOf={() => undefined}
      {...calls}
      {...props}
    />,
  );
  return { ...view, ...calls };
}

/** The rows as read, top first. */
const rows = () => within(screen.getByRole('dialog')).getAllByRole('listitem');
const header = (row: HTMLElement) => row.querySelector('button[aria-expanded]') as HTMLButtonElement;

describe('HistoryModal', () => {
  it('lists every send in the order sent, with its number', () => {
    show();

    expect(rows().map((row) => header(row).textContent)).toEqual(['1oldest', '2middle, changed', '3Image']);
  });

  it('puts a dot on the edited sends alone', () => {
    show();

    expect(rows().map((row) => within(row).queryByTestId('history-edited-dot') !== null)).toEqual([false, true, false]);
  });

  it('starts with the edited sends open on their edit, and the rest folded', () => {
    const { loadContent } = show();

    expect(rows().map((row) => header(row).getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false']);
    expect(within(rows()[1]).getAllByText('middle, changed')).toHaveLength(1);
    expect(loadContent).not.toHaveBeenCalled();
  });

  it('reads a send when its row is opened', async () => {
    const { loadContent } = show();

    fireEvent.click(header(rows()[0]));

    expect(await within(rows()[0]).findByText('all of u1')).toBeTruthy();
    expect(loadContent).toHaveBeenCalledWith('u1');
  });

  it('puts a send in the composer, and gives up an edit only where there is one', () => {
    const { onRecall, onRevert } = show();

    fireEvent.click(within(rows()[0]).getByRole('button', { name: 'Load into input' }));
    expect(onRecall).toHaveBeenCalledWith('u1');

    expect(screen.getAllByRole('button', { name: 'Discard edit' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Discard edit' }));
    expect(onRevert).toHaveBeenCalledWith('u2');
  });

  it('closes on Escape without letting the key reach the page', () => {
    const heard = vi.fn();
    window.addEventListener('keydown', heard);
    const { onClose } = show();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener('keydown', heard);
  });
});
