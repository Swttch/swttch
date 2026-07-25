import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { MessageType } from '@/shared';

// ---------------------------------------------------------------------------
// BridgeContext mock — LIST_PROJECT_FILES resolves with a fixed file/dir set so
// selectResult has populated results to act on.
// ---------------------------------------------------------------------------

interface ProjectFile {
  relativePath: string;
  type: string;
  matchIndices?: number[];
}

let projectFiles: ProjectFile[] = [];

const sendMock = vi.fn((type: string) => {
  if (type === MessageType.LIST_PROJECT_FILES) {
    return Promise.resolve({ requestId: 'r', files: projectFiles });
  }
  return Promise.resolve({});
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    subscribe: vi.fn(() => vi.fn()),
    lastError: null,
  }),
}));

// Imported AFTER vi.mock so the mock is wired first.
import {
  useMention,
  buildMentionToken,
  MentionResult,
  MentionItemType,
} from '../useMention';

interface HarnessParams {
  value: string;
  onChange: (next: string) => void;
  onInsertMention: (token: string, caretOffset: number) => void;
}

function renderMention(params: HarnessParams) {
  return renderHook(
    (props: HarnessParams) =>
      useMention({
        workingDirectory: '/work',
        value: props.value,
        onChange: props.onChange,
        onInsertMention: props.onInsertMention,
      }),
    { initialProps: params },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  projectFiles = [];
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Pure helper: buildMentionToken
// ---------------------------------------------------------------------------

describe('buildMentionToken', () => {
  it('prefixes @ and returns the relativePath for a file', () => {
    const result = new MentionResult({ relativePath: 'src/App.tsx', type: MentionItemType.File });
    expect(buildMentionToken(result)).toBe('@src/App.tsx');
  });

  it('prefixes @ and adds a trailing slash for a directory', () => {
    const result = new MentionResult({ relativePath: 'src/utils', type: MentionItemType.Directory });
    expect(buildMentionToken(result)).toBe('@src/utils/');
  });

  it('does not double the trailing slash for a directory that already ends with /', () => {
    const result = new MentionResult({ relativePath: 'src/utils/', type: MentionItemType.Directory });
    expect(buildMentionToken(result)).toBe('@src/utils/');
  });
});

// ---------------------------------------------------------------------------
// selectResult — inline insertion
// ---------------------------------------------------------------------------

describe('useMention — selectResult', () => {
  it('replaces @query with "@relativePath " and fires onInsertMention for a file', async () => {
    projectFiles = [{ relativePath: 'src/App.tsx', type: 'file' }];
    const onChange = vi.fn();
    const onInsertMention = vi.fn();

    const { result } = renderMention({ value: '@App', onChange, onInsertMention });

    act(() => {
      result.current.detectMention('@App', 4);
    });

    await waitFor(() => expect(result.current.results.length).toBe(1));

    act(() => {
      result.current.selectResult(0);
    });

    expect(onChange).toHaveBeenCalledWith('@src/App.tsx ');
    expect(onInsertMention).toHaveBeenCalledWith('@src/App.tsx', '@src/App.tsx '.length);
  });

  it('uses a trailing-slash token for a directory', async () => {
    projectFiles = [{ relativePath: 'src/utils', type: 'directory' }];
    const onChange = vi.fn();
    const onInsertMention = vi.fn();

    const { result } = renderMention({ value: '@utils', onChange, onInsertMention });

    act(() => {
      result.current.detectMention('@utils', 6);
    });

    await waitFor(() => expect(result.current.results.length).toBe(1));

    act(() => {
      result.current.selectResult(0);
    });

    expect(onChange).toHaveBeenCalledWith('@src/utils/ ');
    expect(onInsertMention).toHaveBeenCalledWith('@src/utils/', '@src/utils/ '.length);
  });

  it('preserves surrounding text when the @mention is mid-string', async () => {
    projectFiles = [{ relativePath: 'src/App.tsx', type: 'file' }];
    const onChange = vi.fn();
    const onInsertMention = vi.fn();

    // "see @App now" — caret after "@App" (index 8).
    const { result } = renderMention({ value: 'see @App now', onChange, onInsertMention });

    act(() => {
      result.current.detectMention('see @App now', 8);
    });

    await waitFor(() => expect(result.current.results.length).toBe(1));

    act(() => {
      result.current.selectResult(0);
    });

    expect(onChange).toHaveBeenCalledWith('see @src/App.tsx  now');
    // caret sits just past "@src/App.tsx " — triggerIndex(4) + token(12) + space(1) = 17
    expect(onInsertMention).toHaveBeenCalledWith('@src/App.tsx', 17);
  });

  it('closes the dropdown after selecting', async () => {
    projectFiles = [{ relativePath: 'src/App.tsx', type: 'file' }];
    const onChange = vi.fn();
    const onInsertMention = vi.fn();

    const { result } = renderMention({ value: '@App', onChange, onInsertMention });

    act(() => {
      result.current.detectMention('@App', 4);
    });

    await waitFor(() => expect(result.current.results.length).toBe(1));

    act(() => {
      result.current.selectResult(0);
    });

    expect(result.current.isActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// search — matchIndices passthrough (raw data preservation: forward backend value unchanged)
// ---------------------------------------------------------------------------

describe('useMention — matchIndices passthrough', () => {
  it('carries matchIndices from the backend response onto MentionResult unchanged', async () => {
    projectFiles = [
      { relativePath: 'webview/src/adapters/BrowserAdapter.ts', type: 'file', matchIndices: [21, 22, 28, 29] },
    ];
    const onChange = vi.fn();
    const onInsertMention = vi.fn();

    const { result } = renderMention({ value: '@bad', onChange, onInsertMention });

    act(() => {
      result.current.detectMention('@bad', 4);
    });

    await waitFor(() => expect(result.current.results.length).toBe(1));

    expect(result.current.results[0].matchIndices).toEqual([21, 22, 28, 29]);
  });

  it('leaves matchIndices undefined when the backend response omits it', async () => {
    projectFiles = [{ relativePath: 'src/App.tsx', type: 'file' }];
    const onChange = vi.fn();
    const onInsertMention = vi.fn();

    const { result } = renderMention({ value: '@App', onChange, onInsertMention });

    act(() => {
      result.current.detectMention('@App', 4);
    });

    await waitFor(() => expect(result.current.results.length).toBe(1));

    expect(result.current.results[0].matchIndices).toBeUndefined();
  });
});
