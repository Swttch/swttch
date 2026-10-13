import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const updateSettingMock = vi.fn();
let mockScopeSettings: Record<string, unknown> = {};
let mockOverridden = false;

vi.mock('@/contexts/ClaudeSettingsContext', () => ({
  // Rows read project-override info through this; null = nothing overridden.
  useClaudeSettingsOrNull: () => null,
  useClaudeSettings: () => ({
    scopeSettings: mockScopeSettings,
    updateSetting: updateSettingMock,
  }),
}));

const resetForSpy = vi.fn();
const resetToGlobalMock = vi.fn();
let mockDisplayed: Record<string, unknown> | null = null;
let mockInherited = false;
let mockProjectValue = false;

vi.mock('@/utils/settingsScope', () => ({
  useIsOverriddenByProject: () => () => mockOverridden,
  // What the project tab shows: its own value, or the global one it inherits.
  useClaudeDisplaySettings: () => ({
    displaySettings: mockDisplayed ?? mockScopeSettings,
    isInherited: () => mockInherited,
    resetFor: (key: string) => {
      resetForSpy(key);
      return mockProjectValue ? resetToGlobalMock : undefined;
    },
  }),
}));

import { SpinnerVerbsRow } from '../SpinnerVerbsRow';

beforeEach(() => {
  updateSettingMock.mockReset();
  resetForSpy.mockReset();
  resetToGlobalMock.mockReset();
  mockScopeSettings = {};
  mockDisplayed = null;
  mockOverridden = false;
  mockInherited = false;
  mockProjectValue = false;
});

/** The empty box at the bottom of the list, where the next verb is typed. */
const addBox = () => screen.getByPlaceholderText('Type a verb and press Enter');

describe('SpinnerVerbsRow layout', () => {
  it('puts the controls under the description, not beside it', () => {
    render(<SpinnerVerbsRow />);

    const description = screen.getByText(/the spinner shows a rotating verb/);
    const modeLabel = screen.getByText('Mode');

    expect(description.compareDocumentPosition(modeLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Under the description means outside the column the row keeps beside it.
    expect(modeLabel.closest('.md\\:justify-between')?.contains(description)).not.toBe(true);
  });

  it('says in Claude’s own words what the chosen mode does', async () => {
    // Append and Replace do not explain themselves; the sentences are the ones Claude's
    // docs give for the two values.
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    expect(screen.getByText('Claude Code adds your verbs to the built-in set')).toBeInTheDocument();
    expect(screen.queryByText('Claude Code shows only your verbs')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Replace' }));

    expect(screen.getByText('Claude Code shows only your verbs')).toBeInTheDocument();
    expect(screen.queryByText('Claude Code adds your verbs to the built-in set')).toBeNull();
  });

  it('gives the mode and the verbs a label each', () => {
    render(<SpinnerVerbsRow />);

    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Mode' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Verbs' })).toBeInTheDocument();
  });

  it('leaves the controls live when the project does not override the key', () => {
    render(<SpinnerVerbsRow />);

    expect(screen.getByRole('group', { name: 'Verbs' }).closest('[aria-disabled]')).toBeNull();
  });

  it('makes the controls inert when the project overrides the key', () => {
    // A global edit the project would keep overriding looks applied and is not (#344).
    mockOverridden = true;
    render(<SpinnerVerbsRow />);

    expect(screen.getByRole('group', { name: 'Verbs' }).closest('[aria-disabled]')).not.toBeNull();
  });
});

describe('SpinnerVerbsRow on the project tab (#547)', () => {
  it('shows the global verbs the project inherits, not an empty list', () => {
    // The scope the tab edits says nothing about the key; the verbs on screen are the global ones.
    mockScopeSettings = {};
    mockDisplayed = { spinnerVerbs: { mode: 'replace', verbs: ['Processing'] } };
    render(<SpinnerVerbsRow />);

    expect(screen.getByDisplayValue('Processing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks the value as inherited when the project does not set the key', () => {
    mockInherited = true;
    render(<SpinnerVerbsRow />);

    expect(screen.getByText('G')).toBeInTheDocument();
  });

  it('carries no inherited mark when the value is the tab’s own', () => {
    render(<SpinnerVerbsRow />);

    expect(screen.queryByText('G')).toBeNull();
  });

  it('offers the way back to the global value when the project sets its own', () => {
    mockProjectValue = true;
    render(<SpinnerVerbsRow />);

    expect(resetForSpy).toHaveBeenCalledWith('spinnerVerbs');
    // The project-value badge, which carries the reset link in its tooltip.
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('offers no way back when the project sets nothing', () => {
    render(<SpinnerVerbsRow />);

    expect(screen.queryByText('P')).toBeNull();
  });
});

describe('SpinnerVerbsRow reading a hand-edited settings file', () => {
  // The backend hands the file over as it is, so the value can be any shape a person typed.
  // None of them may break the settings page.
  it('shows the verbs of a value written by hand, as the CLI documents it', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'replace', verbs: ['Processing'] } };
    render(<SpinnerVerbsRow />);

    expect(screen.getByDisplayValue('Processing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty list when verbs is not a list', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'replace', verbs: 'Processing' } };
    render(<SpinnerVerbsRow />);

    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(addBox()).toBeInTheDocument();
  });

  it('shows only the entries that are text', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering', 3, null, 'Crafting'] } };
    render(<SpinnerVerbsRow />);

    expect(screen.getByDisplayValue('Pondering')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Crafting')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remove / })).toHaveLength(2);
  });

  it('reads a mode other than replace as append, as the spinner does', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'merge', verbs: ['Pondering'] } };
    render(<SpinnerVerbsRow />);

    expect(screen.getByRole('button', { name: 'Append' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByDisplayValue('Pondering')).toBeInTheDocument();
  });

  it.each([null, 'Processing', 7, ['Processing']])('survives spinnerVerbs being %j', (value) => {
    mockScopeSettings = { spinnerVerbs: value };

    expect(() => render(<SpinnerVerbsRow />)).not.toThrow();
    expect(addBox()).toBeInTheDocument();
  });

  it('follows the file when it changes while the page is open', () => {
    // The settings come back from the backend after an edit made outside the app.
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering'] } };
    const { rerender } = render(<SpinnerVerbsRow />);
    expect(screen.getByDisplayValue('Pondering')).toBeInTheDocument();

    mockScopeSettings = { spinnerVerbs: { mode: 'replace', verbs: ['Processing', 'Working'] } };
    rerender(<SpinnerVerbsRow />);

    expect(screen.queryByDisplayValue('Pondering')).toBeNull();
    expect(screen.getByDisplayValue('Processing')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Working')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('SpinnerVerbsRow (Appearance > Chat)', () => {
  it('lists each stored verb on its own line and shows the stored mode', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'replace', verbs: ['Processing', 'Working'] } };
    render(<SpinnerVerbsRow />);

    expect(screen.getByDisplayValue('Processing')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Working')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Append' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('starts on append with only the empty add box when nothing is stored', () => {
    // Adding to the built-in set is the gentler default: a user who only types a
    // verb does not lose the rest.
    render(<SpinnerVerbsRow />);

    expect(screen.getByRole('button', { name: 'Append' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull();
    expect(addBox()).toHaveValue('');
  });

  it('creates: typing a verb in the add box and pressing Enter saves it', async () => {
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.type(addBox(), 'Pondering{Enter}');

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'append',
      verbs: ['Pondering'],
    });
    // The add box is ready for the next one.
    expect(addBox()).toHaveValue('');
  });

  it('creates: a verb typed and left by clicking away is kept, trimmed', async () => {
    // Blur-to-save is the settings page rule, so text still in the box when focus
    // leaves must not be lost.
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.type(addBox(), '  Crafting  ');
    await user.click(document.body);

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'append',
      verbs: ['Crafting'],
    });
  });

  it('ignores a blank entry in the add box', async () => {
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.type(addBox(), '   {Enter}');

    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('ends every box at the same right edge: the remove button sits inside its box, not beside it', () => {
    // A column left free for the × pushed the boxes short of the mode control above them.
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering'] } };
    render(<SpinnerVerbsRow />);

    // The add box has nothing next to it.
    expect(addBox().parentElement?.children).toHaveLength(1);
    // A verb's line is its box and its ×, and the × is positioned over the box.
    const line = screen.getByDisplayValue('Pondering').parentElement;
    expect(line?.children).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove Pondering' }).className).toMatch(/\babsolute\b/);
  });

  it('puts the add box above the list, so a new verb lands directly under it', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering'] } };
    render(<SpinnerVerbsRow />);

    const first = screen.getByDisplayValue('Pondering');
    expect(addBox().compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('adds the new verb in front of the ones already stored', async () => {
    // The list reads top to bottom in the order saved, and the newest sits directly
    // under the box it was typed in.
    mockScopeSettings = { spinnerVerbs: { mode: 'replace', verbs: ['Processing'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.type(addBox(), 'Working{Enter}');

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'replace',
      verbs: ['Working', 'Processing'],
    });
  });

  it('keeps focus in the add box after Enter, emptied and ready for the next verb', async () => {
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.type(addBox(), 'Pondering{Enter}');

    expect(addBox()).toHaveFocus();
    expect(addBox()).toHaveValue('');
  });

  it('keeps focus in a verb’s box after Enter saves its edit', async () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    const box = screen.getByDisplayValue('Pondering');
    await user.clear(box);
    await user.type(box, 'Musing{Enter}');

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', { mode: 'append', verbs: ['Musing'] });
    expect(box).toHaveFocus();
  });

  it('does not take the Enter that ends a Korean composition as the verb being confirmed', () => {
    // The first Enter after typing Hangul only commits the syllable still being composed.
    // Reading it as "add" saved the verb and then the browser typed the leftover syllable
    // into the emptied box, which became a second, one-letter verb.
    render(<SpinnerVerbsRow />);

    fireEvent.change(addBox(), { target: { value: 'ㄹㄹㄹ' } });
    fireEvent.keyDown(addBox(), { key: 'Enter', isComposing: true });

    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(addBox()).toHaveValue('ㄹㄹㄹ');

    fireEvent.keyDown(addBox(), { key: 'Enter' });

    expect(updateSettingMock).toHaveBeenCalledTimes(1);
    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', { mode: 'append', verbs: ['ㄹㄹㄹ'] });
  });

  it('does not take a composing Enter in a verb’s own box as confirming its edit either', () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['ㄱㄴ'] } };
    render(<SpinnerVerbsRow />);

    const box = screen.getByDisplayValue('ㄱㄴ');
    act(() => box.focus());
    fireEvent.change(box, { target: { value: 'ㄱㄴㄷ' } });
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });

    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('updates: editing a verb in its own box saves it in place', async () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering', 'Crafting'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    const box = screen.getByDisplayValue('Pondering');
    await user.clear(box);
    await user.type(box, 'Musing{Enter}');

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'append',
      verbs: ['Musing', 'Crafting'],
    });
  });

  it('does not save when a verb is clicked into and left unchanged', async () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.click(screen.getByDisplayValue('Pondering'));
    await user.click(document.body);

    expect(updateSettingMock).not.toHaveBeenCalled();
  });

  it('deletes: emptying a verb’s box removes that verb', async () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering', 'Crafting'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    const box = screen.getByDisplayValue('Pondering');
    await user.clear(box);
    await user.click(document.body);

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'append',
      verbs: ['Crafting'],
    });
  });

  it('deletes: the remove button drops only that verb', async () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering', 'Crafting'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.click(screen.getByRole('button', { name: 'Remove Pondering' }));

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'append',
      verbs: ['Crafting'],
    });
  });

  it('clears the setting (null) when the last verb is removed', async () => {
    // Replace with no verbs keeps Claude's built-in set anyway, so leaving a
    // hollow object in the file would only be noise.
    mockScopeSettings = { spinnerVerbs: { mode: 'replace', verbs: ['Processing'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.click(screen.getByRole('button', { name: 'Remove Processing' }));

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', null);
  });

  it('saves the new mode at once when verbs already exist', async () => {
    mockScopeSettings = { spinnerVerbs: { mode: 'append', verbs: ['Pondering'] } };
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.click(screen.getByRole('button', { name: 'Replace' }));

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'replace',
      verbs: ['Pondering'],
    });
  });

  it('writes nothing when the mode changes but there are no verbs', async () => {
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.click(screen.getByRole('button', { name: 'Replace' }));

    expect(updateSettingMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Replace' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the chosen mode for verbs added after it', async () => {
    const user = userEvent.setup();
    render(<SpinnerVerbsRow />);

    await user.click(screen.getByRole('button', { name: 'Replace' }));
    await user.type(addBox(), 'Processing{Enter}');

    expect(updateSettingMock).toHaveBeenCalledWith('spinnerVerbs', {
      mode: 'replace',
      verbs: ['Processing'],
    });
  });
});
