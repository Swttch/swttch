import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptForm } from '../PromptForm';

/**
 * Assertions stay on behaviour rather than on copy: this project's tests render
 * the real translations, so matching a message would pin the wording.
 */
const CATEGORIES = [
  { id: 'c1', name: '디버깅', createdAt: 1 },
  { id: 'c2', name: '리뷰', createdAt: 2 },
];

function renderForm(overrides: Partial<Parameters<typeof PromptForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <PromptForm
      categories={CATEGORIES}
      onSubmit={onSubmit}
      onCancel={onCancel}
      onBusyChange={onBusyChange}
      {...overrides}
    />,
  );
  // The category picker puts a combobox between the two, so they are taken by
  // tag rather than by position: `name` is the only <input> of the three, and
  // the combobox input is a `combobox` role rather than a plain textbox.
  const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
  const fields = {
    name: inputs.find((el) => el.tagName === 'INPUT') as HTMLInputElement,
    content: inputs.find((el) => el.tagName === 'TEXTAREA') as HTMLInputElement,
  };
  /** The chip for a chosen category carries a remove button named after it. */
  const chipRemove = (name: string) => screen.getByRole('button', { name: `Remove ${name}` });
  return { onSubmit, onCancel, onBusyChange, fields, chipRemove };
}

function saveButton() {
  return screen.getByRole('button', { name: 'Save' });
}

describe('PromptForm', () => {
  // Each of these waits for the field to be MARKED invalid before asserting the
  // save did not happen. Waiting on the absence alone would pass on the first
  // check, before the submit had a chance to run at all.
  it('refuses to save without a name', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields.content, { target: { value: 'some content' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(fields.name).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a name of only spaces, the same as an empty one', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields.name, { target: { value: '   ' } });
    fireEvent.change(fields.content, { target: { value: 'some content' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(fields.name).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to save without content', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields.name, { target: { value: 'a name' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(fields.content).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves the typed name and content', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields.name, { target: { value: '머지완료' } });
    fireEvent.change(fields.content, { target: { value: '머지했어 확인해' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('머지완료', '머지했어 확인해', []));
  });

  it('reports busy while the save is in flight and again when it settles', async () => {
    const { onBusyChange, fields } = renderForm();
    fireEvent.change(fields.name, { target: { value: 'a' } });
    fireEvent.change(fields.content, { target: { value: 'b' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(false));
  });

  it('stays on the screen when the save is rejected', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('nope'));
    const { fields } = renderForm({ onSubmit });
    fireEvent.change(fields.name, { target: { value: 'a' } });
    fireEvent.change(fields.content, { target: { value: 'b' } });

    fireEvent.click(saveButton());

    // The save was attempted and the form did not unmount, so the user can
    // retry without retyping.
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
  });

  /**
   * The picker replaced a row of toggles, so what is asserted here is the
   * contract that survived the swap: whatever is chosen travels to onSubmit as
   * ids, and what the prompt already carries is on screen when it opens.
   *
   * Picking from the dropdown is not driven here. Ark UI's combobox is a state
   * machine that needs real pointer and focus events, and a test that fakes
   * them would be testing the fake. The chips, the removal, and the values that
   * reach onSubmit are the parts that are ours.
   */
  it('carries the prompt\'s categories through a save untouched', async () => {
    const { onSubmit } = renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        categories: ['c1', 'c2'],
        createdAt: 1,
        updatedAt: 1,
      },
    });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('n', 'c', ['c1', 'c2']));
  });

  // Removing the last chip is how a prompt leaves its categories, so the empty
  // list has to travel rather than being read as "no change".
  it('passes an empty list once the last chip is removed', async () => {
    const { onSubmit, chipRemove } = renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        categories: ['c1'],
        createdAt: 1,
        updatedAt: 1,
      },
    });

    fireEvent.click(chipRemove('디버깅'));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('n', 'c', []));
  });

  it('removes only the chip that was clicked', async () => {
    const { onSubmit, chipRemove } = renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        categories: ['c1', 'c2'],
        createdAt: 1,
        updatedAt: 1,
      },
    });

    fireEvent.click(chipRemove('디버깅'));
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('n', 'c', ['c2']));
  });

  /**
   * Asserted through the chip's remove button rather than through its text: the
   * dropdown lists every category by name too, so the name alone appears twice
   * for a chosen one and matching it would pass for the wrong reason.
   */
  it('shows a chip for each category the prompt being edited carries', () => {
    renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        categories: ['c2'],
        createdAt: 1,
        updatedAt: 1,
      },
    });

    expect(screen.queryByRole('button', { name: 'Remove 리뷰' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove 디버깅' })).toBeNull();
  });

  it('prefills the fields of the prompt being edited', () => {
    const { fields } = renderForm({
      editing: {
        id: 'p1',
        name: '기존 이름',
        content: '기존 내용',
        createdAt: 1,
        updatedAt: 1,
      },
    });
    expect(fields.name.value).toBe('기존 이름');
    expect(fields.content.value).toBe('기존 내용');
  });
});
