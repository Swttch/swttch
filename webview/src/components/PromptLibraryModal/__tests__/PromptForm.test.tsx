import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PromptForm } from '../PromptForm';

/**
 * Assertions stay on behaviour rather than on copy: this project's tests render
 * the real translations, so matching a message would pin the wording.
 */
function renderForm(overrides: Partial<Parameters<typeof PromptForm>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  const onBusyChange = vi.fn();
  render(
    <PromptForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      onBusyChange={onBusyChange}
      {...overrides}
    />,
  );
  // The category input carries a datalist, which makes its role `combobox`
  // rather than `textbox` — so it is fetched by its own role instead of by
  // position among the text fields.
  const textboxes = screen.getAllByRole('textbox') as HTMLInputElement[];
  const fields = {
    name: textboxes[0],
    content: textboxes[1],
    category: screen.getByRole('combobox') as HTMLInputElement,
  };
  return { onSubmit, onCancel, onBusyChange, fields, textboxes };
}

/** The save button is the last one on the screen. */
function saveButton() {
  const buttons = screen.getAllByRole('button');
  return buttons[buttons.length - 1];
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

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('머지완료', '머지했어 확인해', ''));
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

  it('saves the category alongside the name and content', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields.name, { target: { value: 'a' } });
    fireEvent.change(fields.category, { target: { value: '디버깅' } });
    fireEvent.change(fields.content, { target: { value: 'b' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a', 'b', '디버깅'));
  });

  // Emptying the field is how a prompt leaves its category, so the blank has to
  // travel rather than being read as "no change".
  it('passes an empty category when the field is cleared', async () => {
    const { onSubmit, fields } = renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        category: '디버깅',
        createdAt: 1,
        updatedAt: 1,
      },
    });
    fireEvent.change(fields.category, { target: { value: '' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('n', 'c', ''));
  });

  it('prefills the fields of the prompt being edited', () => {
    const { fields } = renderForm({
      editing: {
        id: 'p1',
        name: '기존 이름',
        content: '기존 내용',
        category: '기존 분류',
        createdAt: 1,
        updatedAt: 1,
      },
    });
    expect(fields.name.value).toBe('기존 이름');
    expect(fields.category.value).toBe('기존 분류');
    expect(fields.content.value).toBe('기존 내용');
  });
});
