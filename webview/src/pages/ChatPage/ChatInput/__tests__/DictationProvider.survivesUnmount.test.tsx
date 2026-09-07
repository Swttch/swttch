import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MessageType } from '@/shared';

/**
 * A recording must outlive the composer.
 *
 * The composer is not always mounted: an approval prompt (permission, plan,
 * question) takes its slot at the foot of the chat, which unmounts it. While
 * the dictation session lived inside the composer, that unmount ran the cleanup
 * that releases the microphone — so a prompt appearing mid-sentence killed the
 * recording and the user had to notice, restart, and repeat themselves
 * (issue #409).
 *
 * These tests drive the unmount directly rather than through ChatPage: the
 * point under test is the ownership boundary, and going through the real page
 * would drag in the whole chat to assert something the provider decides on its
 * own.
 */

const sendMock = vi.fn((type: string) => {
  if (type === MessageType.START_DICTATION) return Promise.resolve({ status: 'ok' });
  return Promise.resolve({});
});

vi.mock('@/contexts/BridgeContext', () => ({
  useBridgeContext: () => ({
    isConnected: true,
    send: sendMock,
    sendRaw: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    lastError: null,
  }),
}));

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: {} }),
}));

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({
    settings: {},
    updateSetting: vi.fn(),
    updateSettingWithScope: vi.fn(),
  }),
}));

vi.mock('@/contexts/ChatInputStateContext', () => ({
  useChatInputState: () => ({ input: '', setInput: vi.fn() }),
}));

vi.mock('@/contexts/ChatInputFocusContext', () => ({
  useChatInputFocus: () => ({ textareaRef: { current: null }, focus: vi.fn() }),
}));

vi.mock('@/hooks/queries/useInstallCcb', () => ({
  useInstallCcb: () => ({ install: vi.fn(), installing: false }),
}));

vi.mock('@/hooks/queries/useDictationAvailability', () => ({
  useDictationAvailability: () => ({ availability: { available: true } }),
}));

// Already answered: the first-use question is not what these tests are about,
// and leaving it pending would stop every start at a dialog.
vi.mock('@/hooks/useVoicePrompt', () => ({
  useVoicePrompt: () => ({ shouldAsk: false, markAsked: vi.fn(), decide: vi.fn() }),
}));

vi.mock('@/components/ConfirmDialog/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirmDialog: null, ask: vi.fn(), confirm: vi.fn() }),
  ConfirmResult: { Confirmed: 'confirmed', Cancelled: 'cancelled' },
}));

const micStop = vi.fn();

vi.mock('../hooks/microphone', async () => {
  const actual = await vi.importActual<typeof import('../hooks/microphone')>('../hooks/microphone');
  return {
    ...actual,
    startMicrophone: vi.fn(() => Promise.resolve({ stop: micStop })),
  };
});

// Imported AFTER vi.mock so the mocks are wired first.
import { DictationProvider, useDictationContext } from '../DictationProvider';
import { DictationState } from '../hooks/useDictation';

/** Stands in for the composer: mounted and unmounted like the real one. */
function Composer() {
  const { dictation } = useDictationContext();
  return <div data-testid="composer">{dictation.state}</div>;
}

/**
 * Reads the session from outside the composer, the way the recording notice
 * that steps in for the microphone button does.
 */
let session: ReturnType<typeof useDictationContext> | null = null;
function Probe() {
  session = useDictationContext();
  return null;
}

/** The chat foot: either the composer, or an approval prompt in its place. */
function Chat({ promptOpen }: { promptOpen: boolean }) {
  return (
    <DictationProvider>
      <Probe />
      {promptOpen ? <div data-testid="prompt">approve?</div> : <Composer />}
    </DictationProvider>
  );
}

async function startRecording() {
  await act(async () => {
    await session!.dictation.start();
  });
  expect(session!.dictation.state).toBe(DictationState.Listening);
}

describe('DictationProvider — a recording outlives the composer', () => {
  beforeEach(() => {
    session = null;
    sendMock.mockClear();
    micStop.mockClear();
  });

  it('keeps the microphone open when an approval prompt replaces the composer', async () => {
    const { rerender, queryByTestId } = render(<Chat promptOpen={false} />);
    await startRecording();

    await act(async () => {
      rerender(<Chat promptOpen />);
    });

    // The composer really did go away — otherwise this test would pass without
    // proving anything about unmounting.
    expect(queryByTestId('composer')).toBeNull();
    expect(queryByTestId('prompt')).not.toBeNull();

    expect(micStop).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalledWith(MessageType.STOP_DICTATION, {});
    expect(session!.dictation.state).toBe(DictationState.Listening);
  });

  it('is still recording when the composer comes back', async () => {
    const { rerender, queryByTestId } = render(<Chat promptOpen={false} />);
    await startRecording();

    await act(async () => {
      rerender(<Chat promptOpen />);
    });
    await act(async () => {
      rerender(<Chat promptOpen={false} />);
    });

    expect(queryByTestId('composer')).not.toBeNull();
    expect(micStop).not.toHaveBeenCalled();
    expect(session!.dictation.state).toBe(DictationState.Listening);
  });

  it('releases the microphone when the chat screen itself goes away', async () => {
    const { unmount } = render(<Chat promptOpen={false} />);
    await startRecording();

    await act(async () => {
      unmount();
    });

    // The boundary moved out to the provider, not away altogether: leaving the
    // chat entirely must still close the microphone.
    expect(micStop).toHaveBeenCalled();
  });
});
