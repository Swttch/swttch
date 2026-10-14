import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkingDirMissingError } from '@/hooks/WorkingDirMissingError';

const { setWorkingDirectory, runtime, chatStream } = vi.hoisted(() => ({
  setWorkingDirectory: vi.fn(),
  runtime: { inIde: false },
  chatStream: { error: null as Error | null },
}));

vi.mock('@/contexts', () => ({
  useSessionContext: () => ({ setWorkingDirectory }),
  useApi: () => ({}),
  useSettings: () => ({ settings: {} }),
}));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ error: chatStream.error, authDiagnosis: null }),
}));
vi.mock('../../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ error: chatStream.error, authDiagnosis: null }),
}));
vi.mock('@/config/environment', () => ({ isJetBrains: () => runtime.inIde }));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) => (values ? `${key}|${Object.values(values).join('|')}` : key),
  }),
}));

import { StreamErrorBanner } from '../index';

describe('StreamErrorBanner for a project whose folder is gone', () => {
  beforeEach(() => {
    setWorkingDirectory.mockReset();
    runtime.inIde = false;
    chatStream.error = new WorkingDirMissingError('/private/tmp/ccg-demo', 'The working directory /private/tmp/ccg-demo no longer exists.');
  });

  it('names the folder instead of showing the CLI error text', () => {
    render(<StreamErrorBanner />);

    expect(screen.getByText('streamError.workingDirMissing.message|/private/tmp/ccg-demo')).toBeInTheDocument();
    expect(screen.queryByText(/spawn claude/)).toBeNull();
  });

  it('takes the user back to the project list from the browser', () => {
    render(<StreamErrorBanner />);

    fireEvent.click(screen.getByRole('button', { name: 'streamError.workingDirMissing.openProjects' }));

    expect(setWorkingDirectory).toHaveBeenCalledWith(null);
  });

  it('offers no way back inside the IDE, where the open project is the only one', () => {
    runtime.inIde = true;
    render(<StreamErrorBanner />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('leaves every other error to the default banner', () => {
    chatStream.error = new Error('Service error: SPAWN_ERROR - spawn claude ENOENT');
    render(<StreamErrorBanner />);

    expect(screen.getByText('Service error: SPAWN_ERROR - spawn claude ENOENT')).toBeInTheDocument();
  });
});
