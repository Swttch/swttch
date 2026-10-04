import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { MigrationStatus } from '@/hooks/useMigrationStatus';

const { migrationState, retryState } = vi.hoisted(() => ({
  migrationState: {
    current: { status: 'idle', failedMigration: null, unreadable: [] } as MigrationStatus,
  },
  retryState: { retry: vi.fn(), retrying: false, listenedWhileFailed: [] as boolean[] },
}));

vi.mock('@/hooks/useMigrationStatus', () => ({
  useMigrationStatus: () => migrationState.current,
}));

vi.mock('@/hooks/useMigrationRetry', () => ({
  useMigrationRetry: (failed: boolean) => {
    retryState.listenedWhileFailed.push(failed);
    return { retry: retryState.retry, retrying: retryState.retrying };
  },
}));

vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key}|${Object.values(values).join('|')}` : key,
  }),
}));

import { MigrationBanner } from '../MigrationBanner';

const set = (state: Partial<MigrationStatus>) => {
  migrationState.current = { status: 'idle', failedMigration: null, unreadable: [], ...state };
};

describe('MigrationBanner', () => {
  beforeEach(() => {
    set({});
    retryState.retry.mockReset();
    retryState.retrying = false;
    retryState.listenedWhileFailed = [];
  });

  it('says nothing when all is well, which is nearly always', () => {
    const { container } = render(<MigrationBanner />);

    expect(container.firstChild).toBeNull();
  });

  it('tells the user that their data is being updated while a long run is going', () => {
    set({ status: 'running' });
    render(<MigrationBanner />);

    expect(screen.getByText('dataUpdate.running')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('names the migration that failed, and offers no way to close it', () => {
    set({ status: 'failed', failedMigration: '20261004120200_import-legacy-prompts' });
    render(<MigrationBanner />);

    expect(screen.getByText('dataUpdate.failed|20261004120200_import-legacy-prompts')).toBeInTheDocument();
    // The library and the list stay held back while this is true, so it must not go away.
    expect(screen.queryByRole('button', { name: 'dataUpdate.dismiss' })).toBeNull();
  });

  it('puts a button at the end of a failure that runs the migrations again, without a restart', () => {
    set({ status: 'failed', failedMigration: 'm' });
    render(<MigrationBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'dataUpdate.retry' }));

    expect(retryState.retry).toHaveBeenCalledTimes(1);
  });

  it('shows that it is trying, and cannot be pressed again meanwhile', () => {
    set({ status: 'failed', failedMigration: 'm' });
    retryState.retrying = true;
    render(<MigrationBanner />);

    const button = screen.getByRole('button', { name: 'dataUpdate.retrying' });
    expect(button).toBeDisabled();
  });

  it('has no retry button for anything but a failure', () => {
    set({ status: 'done', unreadable: ['/a'] });
    render(<MigrationBanner />);

    expect(screen.queryByRole('button', { name: 'dataUpdate.retry' })).toBeNull();
  });

  it('tells the retry hook whether a run is failed, so it listens only then', () => {
    set({ status: 'failed', failedMigration: 'm' });
    render(<MigrationBanner />);
    expect(retryState.listenedWhileFailed[retryState.listenedWhileFailed.length - 1]).toBe(true);

    set({ status: 'done', unreadable: ['/a'] });
    render(<MigrationBanner />);
    expect(retryState.listenedWhileFailed[retryState.listenedWhileFailed.length - 1]).toBe(false);
  });

  it('lists the folders whose old files could not be read, and lets the user close it', () => {
    set({ status: 'done', unreadable: ['/Users/me/Documents/app', '/Users/me/Desktop/old'] });
    render(<MigrationBanner />);

    expect(screen.getByText('dataUpdate.unreadable|/Users/me/Documents/app, /Users/me/Desktop/old')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'dataUpdate.dismiss' }));

    expect(screen.queryByText(/dataUpdate\.unreadable/)).toBeNull();
  });
});
