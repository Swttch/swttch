import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkingDirMissingError } from '@/hooks/WorkingDirMissingError';

const { setWorkingDirectory, chooseFolder, runtime, chatStream } = vi.hoisted(() => ({
  setWorkingDirectory: vi.fn(),
  chooseFolder: vi.fn(),
  runtime: { inIde: false },
  chatStream: { error: null as Error | null },
}));

vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ setWorkingDirectory }),
}));
vi.mock('@/hooks/useChooseFolder', () => ({ useChooseFolder: () => chooseFolder }));
vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ error: chatStream.error, authDiagnosis: null }),
}));
vi.mock('../../../contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({ error: chatStream.error, authDiagnosis: null }),
}));
vi.mock('@/config/environment', () => ({ isJetBrains: () => runtime.inIde }));
vi.mock('@/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { MissingFolderBar } from '../MissingFolderBar';
import { StreamErrorBanner } from '../StreamErrorBanner';

describe('MissingFolderBar, which takes the chat input\'s place when the folder is gone', () => {
  beforeEach(() => {
    setWorkingDirectory.mockReset();
    chooseFolder.mockReset();
    runtime.inIde = false;
  });

  it('says the folder is gone and offers to choose another', () => {
    render(<MissingFolderBar />);

    expect(screen.getByText('missingFolder.message')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'missingFolder.chooseFolder' }));

    expect(chooseFolder).toHaveBeenCalledTimes(1);
  });

  it('takes the user back to the project list from the browser', () => {
    render(<MissingFolderBar />);

    fireEvent.click(screen.getByRole('button', { name: 'missingFolder.openProjects' }));

    expect(setWorkingDirectory).toHaveBeenCalledWith(null);
  });

  it('offers only the folder dialog inside the IDE, where there is no project list to go back to', () => {
    runtime.inIde = true;
    render(<MissingFolderBar />);

    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['missingFolder.chooseFolder']);
  });
});

describe('StreamErrorBanner for a project whose folder is gone', () => {
  beforeEach(() => {
    chatStream.error = null;
  });

  it('draws nothing, since the bar in the input\'s place already says it', () => {
    chatStream.error = new WorkingDirMissingError('/private/tmp/ccg-demo', 'The working directory /private/tmp/ccg-demo no longer exists.');
    const { container } = render(<StreamErrorBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('leaves every other error to the default banner', () => {
    chatStream.error = new Error('Service error: SPAWN_ERROR - spawn claude ENOENT');
    render(<StreamErrorBanner />);

    expect(screen.getByText('Service error: SPAWN_ERROR - spawn claude ENOENT')).toBeInTheDocument();
  });
});
