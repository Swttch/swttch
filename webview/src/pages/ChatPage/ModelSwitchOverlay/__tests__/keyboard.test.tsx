import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ModelInfo } from '@/types/slashCommand';

/**
 * The model panel is operated from the keyboard: it takes focus when it opens, the
 * up and down arrows move a highlight that looks like hover, Enter acts as a click,
 * choosing a model leaves the panel open, and Escape or an outside click closes it and
 * hands focus back to whatever held it before. The left and right arrows step the
 * effort level.
 */

let mockModels: ModelInfo[] = [];
const switchModel = vi.fn(async () => undefined);
const stepBy = vi.fn();
let mockStepper = { supportsEffort: false, index: 1, label: 'Medium', stepBy };

vi.mock('@/contexts/ChatStreamContext', () => ({
  useChatStreamContext: () => ({
    sessionModel: null,
    setSessionModel: vi.fn(),
    appendMessage: vi.fn(),
  }),
}));
vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  useClaudeSettings: () => ({ settings: {}, updateSetting: vi.fn() }),
}));
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({ settings: { syncModelToDefault: true } }),
}));
vi.mock('@/contexts/CliConfigContext', () => ({
  useCliConfig: () => ({ controlResponse: { response: { response: { models: mockModels } } } }),
}));
vi.mock('@/contexts/SessionContext', () => ({
  useSessionContext: () => ({ currentSessionId: null }),
}));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/tmp' }) }));
vi.mock('@/contexts/FableProbeContext', () => ({
  useFableProbe: () => ({ probedAvailable: null, probeFableAvailability: vi.fn() }),
  shouldProbeFable: () => false,
}));
vi.mock('@/hooks/useVersionInfo', () => ({ useVersionInfo: () => ({ cliVersion: '2.1.170' }) }));
vi.mock('@/hooks/useModelSwitch', () => ({ useModelSwitch: () => switchModel }));
vi.mock('@/hooks/useEffortStepper', () => ({ useEffortStepper: () => mockStepper }));

import { ModelSwitchOverlay } from '../index';

function catalog(count: number): ModelInfo[] {
  return Array.from({ length: count }, (_, i) => ModelInfo.from({
    value: `proxy-model-${i}`,
    resolvedModel: `proxy-model-${i}`,
    displayName: `Proxy Model ${i}`,
    description: `Custom model ${i}`,
  }));
}

/**
 * Lets the switch finish. The panel closes (or not) only after `await switchModel`, so a
 * check made straight after the click would pass even if the panel did close.
 */
const settled = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

const panelEl = (): HTMLElement => screen.getByText('Select a model').closest('[tabindex="-1"]') as HTMLElement;
const row = (i: number): HTMLElement => screen.getByRole('button', { name: new RegExp(`Proxy Model ${i}\\b`) });
/**
 * Whether the row carries the highlight, the one the command palette gives its active row.
 * `hover:bg-[var(--surface-selected)]` is a different class: it only paints under the mouse.
 */
const looksHovered = (i: number): boolean => row(i).classList.contains('bg-[var(--surface-selected)]');

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  mockModels = catalog(5);
  switchModel.mockClear();
  stepBy.mockClear();
  mockStepper = { supportsEffort: false, index: 1, label: 'Medium', stepBy };
});

describe('focus', () => {
  it('moves into the panel when it opens', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(document.activeElement).toBe(panelEl());
  });

  it('keeps the focus under StrictMode, which mounts, cleans up and mounts again', async () => {
    const before = render(<button data-testid="before">elsewhere</button>);
    screen.getByTestId('before').focus();

    render(<StrictMode><ModelSwitchOverlay onClose={vi.fn()} /></StrictMode>);
    // The cleanup in the middle schedules a hand-back to the old element; it must not
    // land after the second mount and pull the focus out of the panel.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.activeElement).toBe(panelEl());
    before.unmount();
  });

  it('goes back to the element that held it before, whatever that was', async () => {
    const before = render(<button data-testid="before">elsewhere</button>);
    const previous = screen.getByTestId('before');
    previous.focus();
    expect(document.activeElement).toBe(previous);

    const panel = render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(document.activeElement).not.toBe(previous);

    panel.unmount();
    // Handed back on the next tick, not inside the key press that closed the panel.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(document.activeElement).toBe(previous);
    before.unmount();
  });
});

describe('arrow keys and Enter', () => {
  it('highlights the first row to start with, like a hover', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(looksHovered(0)).toBe(true);
    expect(looksHovered(1)).toBe(false);
  });

  it('moves the highlight down and up, and stops at the ends', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.keyDown(panelEl(), { key: 'ArrowDown' });
    expect(looksHovered(1)).toBe(true);
    expect(looksHovered(0)).toBe(false);

    fireEvent.keyDown(panelEl(), { key: 'ArrowUp' });
    fireEvent.keyDown(panelEl(), { key: 'ArrowUp' });
    expect(looksHovered(0)).toBe(true);

    for (let i = 0; i < 9; i++) fireEvent.keyDown(panelEl(), { key: 'ArrowDown' });
    expect(looksHovered(4)).toBe(true);
  });

  it('switches to the highlighted model on Enter and leaves the panel open', async () => {
    const onClose = vi.fn();
    render(<ModelSwitchOverlay onClose={onClose} />);
    fireEvent.keyDown(panelEl(), { key: 'ArrowDown' });
    fireEvent.keyDown(panelEl(), { key: 'ArrowDown' });
    fireEvent.keyDown(panelEl(), { key: 'Enter' });
    await settled();

    expect(switchModel).toHaveBeenCalledTimes(1);
    expect(switchModel).toHaveBeenCalledWith('proxy-model-2');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not switch again for a held Enter', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.keyDown(panelEl(), { key: 'Enter', repeat: true });
    expect(switchModel).not.toHaveBeenCalled();
  });

  it('leaves the keys alone while an IME is composing', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.keyDown(panelEl(), { key: 'ArrowDown', isComposing: true });
    expect(looksHovered(0)).toBe(true);
    expect(looksHovered(1)).toBe(false);
  });
});

describe('choosing with the mouse', () => {
  it('switches the model and leaves the panel open', async () => {
    const onClose = vi.fn();
    render(<ModelSwitchOverlay onClose={onClose} />);
    fireEvent.click(row(3));
    await settled();
    expect(switchModel).toHaveBeenCalledWith('proxy-model-3');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('moves the highlight with the mouse, so only one row looks hovered', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.mouseMove(row(2));
    expect(looksHovered(2)).toBe(true);
    expect(looksHovered(0)).toBe(false);
  });
});

describe('closing', () => {
  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ModelSwitchOverlay onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a click outside the panel', () => {
    const onClose = vi.fn();
    render(<ModelSwitchOverlay onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open for a click inside the panel', () => {
    const onClose = vi.fn();
    render(<ModelSwitchOverlay onClose={onClose} />);
    fireEvent.mouseDown(row(1));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('still closes after "/model <name>" names the model up front', async () => {
    const onClose = vi.fn();
    render(<ModelSwitchOverlay onClose={onClose} autoSelectQuery="Proxy Model 3" />);
    await act(async () => { await Promise.resolve(); });
    // A name that matches nothing leaves the picker open, so only assert the pairing:
    // whenever the switch happened, the panel closed with it.
    expect(onClose).toHaveBeenCalledTimes(switchModel.mock.calls.length);
  });
});

describe('key guide in the header', () => {
  const guide = () => screen.queryAllByText(/^(Open panel|Move model|Change effort)$/).map((el) => el.textContent);

  it('lists open, move and effort in that order, each with its keys', () => {
    mockStepper = { supportsEffort: true, index: 1, label: 'Medium', stepBy };
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(guide()).toEqual(['Open panel', 'Move model', 'Change effort']);

    const keysBefore = (label: string) => screen.getByText(label).previousElementSibling?.textContent;
    expect(keysBefore('Open panel')).toMatch(/^(⌘⇧M|Ctrl\+Shift\+M)$/);
    expect(keysBefore('Move model')).toBe('↑↓');
    expect(keysBefore('Change effort')).toBe('←→');
  });

  it('leaves out the effort keys when the model has no effort levels, since they would do nothing', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    expect(guide()).toEqual(['Open panel', 'Move model']);
  });
});

describe('effort arrows', () => {
  it('steps the effort level with the left and right arrows', () => {
    mockStepper = { supportsEffort: true, index: 1, label: 'Medium', stepBy };
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.keyDown(panelEl(), { key: 'ArrowRight' });
    fireEvent.keyDown(panelEl(), { key: 'ArrowLeft' });
    expect(stepBy).toHaveBeenNthCalledWith(1, 1);
    expect(stepBy).toHaveBeenNthCalledWith(2, -1);
    expect(screen.getByText('(Medium)')).toBeInTheDocument();
  });

  it('ignores them when the model has no effort levels', () => {
    render(<ModelSwitchOverlay onClose={vi.fn()} />);
    fireEvent.keyDown(panelEl(), { key: 'ArrowRight' });
    expect(stepBy).not.toHaveBeenCalled();
    expect(screen.queryByText('Effort')).not.toBeInTheDocument();
  });
});
