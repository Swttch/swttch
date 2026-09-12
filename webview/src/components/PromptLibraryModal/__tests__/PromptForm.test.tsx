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
      scope="global"
      projectAvailable
      onSubmit={onSubmit}
      onCancel={onCancel}
      onBusyChange={onBusyChange}
      {...overrides}
    />,
  );
  // Name then content, in DOM order.
  const fields = screen.getAllByRole('textbox') as HTMLInputElement[];
  return { onSubmit, onCancel, onBusyChange, fields };
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
    fireEvent.change(fields[1], { target: { value: 'some content' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(fields[0]).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a name of only spaces, the same as an empty one', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields[0], { target: { value: '   ' } });
    fireEvent.change(fields[1], { target: { value: 'some content' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(fields[0]).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses to save without content', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields[0], { target: { value: 'a name' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(fields[1]).toHaveAttribute('aria-invalid', 'true'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves the typed name and content', async () => {
    const { onSubmit, fields } = renderForm();
    fireEvent.change(fields[0], { target: { value: '머지완료' } });
    fireEvent.change(fields[1], { target: { value: '머지했어 확인해' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('머지완료', '머지했어 확인해'));
  });

  it('reports busy while the save is in flight and again when it settles', async () => {
    const { onBusyChange, fields } = renderForm();
    fireEvent.change(fields[0], { target: { value: 'a' } });
    fireEvent.change(fields[1], { target: { value: 'b' } });

    fireEvent.click(saveButton());

    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));
    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(false));
  });

  it('stays on the screen when the save is rejected', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('nope'));
    const { fields } = renderForm({ onSubmit });
    fireEvent.change(fields[0], { target: { value: 'a' } });
    fireEvent.change(fields[1], { target: { value: 'b' } });

    fireEvent.click(saveButton());

    // The save was attempted and the form did not unmount, so the user can
    // retry without retyping.
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.getAllByRole('textbox')).toHaveLength(2);
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
    expect(fields[0].value).toBe('기존 이름');
    expect(fields[1].value).toBe('기존 내용');
  });
});
