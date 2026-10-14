import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { ProjectRow } from '../ProjectRow';

const row = (folderMissing: boolean) => (
  <ProjectRow
    name="ccg-demo"
    path="/private/tmp/ccg-demo"
    sessionCount={145}
    folderMissing={folderMissing}
    homeDir="/Users/me"
    isActive={false}
    isFavorite={false}
    onSelect={() => {}}
    onToggleFavorite={() => {}}
    onDelete={async () => true}
    onSaveMeta={async () => true}
  />
);

describe('ProjectRow when the project folder is gone', () => {
  it('tells the user that the folder was not found', () => {
    render(row(true));

    expect(screen.getByText('folderMissing')).toBeInTheDocument();
  });

  it('shows no such tag while the folder is there', () => {
    render(row(false));

    expect(screen.queryByText('folderMissing')).toBeNull();
  });
});
