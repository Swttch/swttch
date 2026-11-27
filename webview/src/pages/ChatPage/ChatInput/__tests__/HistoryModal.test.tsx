import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@/i18n/config';
import { emptyContent, type ComposerContent } from '@/shared';
import { HistoryModal } from '../HistoryModal';
import type { SendIndexEntry } from '../../sendList';

const written = (text: string): ComposerContent => ({ ...emptyContent(), text });
const entry = (key: string, text: string, images = 0): SendIndexEntry => ({ key, text, images, loaded: false });

function show(props: Partial<React.ComponentProps<typeof HistoryModal>> = {}) {
  const calls = { onJump: vi.fn(), onRevert: vi.fn(), onClose: vi.fn(), loadContent: vi.fn(async (key: string) => written(`all of ${key}`)) };
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
  it('lists every send, newest first, with its number', () => {
    show();

    expect(rows().map((row) => header(row).textContent)).toEqual(['3Image', '2middle, changedEdited', '1oldest']);
  });

  it('starts with the edited sends open on their edit, and the rest folded', () => {
    const { loadContent } = show();

    expect(rows().map((row) => header(row).getAttribute('aria-expanded'))).toEqual(['false', 'true', 'false']);
    expect(within(rows()[1]).getAllByText('middle, changed')).toHaveLength(2);
    expect(loadContent).not.toHaveBeenCalled();
  });

  it('reads a send when its row is opened', async () => {
    const { loadContent } = show();

    fireEvent.click(header(rows()[2]));

    expect(await within(rows()[2]).findByText('all of u1')).toBeTruthy();
    expect(loadContent).toHaveBeenCalledWith('u1');
  });

  it('goes to a send, and gives up an edit only where there is one', () => {
    const { onJump, onRevert } = show();

    fireEvent.click(within(rows()[2]).getByRole('button', { name: 'Go to' }));
    expect(onJump).toHaveBeenCalledWith('u1');

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
