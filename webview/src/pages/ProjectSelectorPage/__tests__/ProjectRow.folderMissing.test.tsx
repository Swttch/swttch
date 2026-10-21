import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ProjectRow } from '../ProjectRow';

const row = (
  folderMissing: boolean,
  handlers: { onSelect?: () => void; onDelete?: () => Promise<boolean> } = {},
) => (
  <ProjectRow
    name="ccg-demo"
    path="/private/tmp/ccg-demo"
    sessionCount={145}
    folderMissing={folderMissing}
    homeDir="/Users/me"
    isActive={false}
    isFavorite={false}
    onSelect={handlers.onSelect ?? (() => {})}
    onToggleFavorite={() => {}}
    onDelete={handlers.onDelete ?? (async () => true)}
    onSaveMeta={async () => true}
  />
);

describe('ProjectRow when the project folder is gone', () => {
  it('tells the user that the folder was not found', () => {
    render(row(true));

    expect(screen.getByLabelText('deleteConfirm.title')).toBeInTheDocument();
  });

  it('shows no such tag while the folder is there', () => {
    render(row(false));

    expect(screen.queryByLabelText('deleteConfirm.title')).toBeNull();
  });

  it('asks for confirmation when the tag is clicked, without opening the project', async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn(async () => true);
    render(row(true, { onSelect, onDelete }));

    fireEvent.click(screen.getByLabelText('deleteConfirm.title'));

    expect(await screen.findByText('deleteConfirm.message')).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes the project once the confirmation is accepted', async () => {
    const onDelete = vi.fn(async () => true);
    render(row(true, { onDelete }));

    fireEvent.click(screen.getByLabelText('deleteConfirm.title'));
    fireEvent.click(await screen.findByText('deleteConfirm.confirmLabel'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
