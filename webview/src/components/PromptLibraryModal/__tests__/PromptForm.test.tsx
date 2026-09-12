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
  // Name then content, in DOM order. The categories are toggle buttons rather
  // than a field, so they are reached by their own names.
  const textboxes = screen.getAllByRole('textbox') as HTMLInputElement[];
  const fields = { name: textboxes[0], content: textboxes[1] };
  const categoryToggle = (name: string) => screen.getByRole('button', { name });
  return { onSubmit, onCancel, onBusyChange, fields, categoryToggle };
}

/** The save button is the last one on the screen, after the category toggles. */
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

  it('saves the categories that were toggled on, by id', async () => {
    const { onSubmit, fields, categoryToggle } = renderForm();
    fireEvent.change(fields.name, { target: { value: 'a' } });
    fireEvent.change(fields.content, { target: { value: 'b' } });
    fireEvent.click(categoryToggle('디버깅'));

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a', 'b', ['c1']));
  });

  // A prompt belongs to as many categories as the user says, which is the whole
  // reason the field is a list.
  it('saves more than one category', async () => {
    const { onSubmit, fields, categoryToggle } = renderForm();
    fireEvent.change(fields.name, { target: { value: 'a' } });
    fireEvent.change(fields.content, { target: { value: 'b' } });
    fireEvent.click(categoryToggle('디버깅'));
    fireEvent.click(categoryToggle('리뷰'));

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a', 'b', ['c1', 'c2']));
  });

  // Turning the last one off is how a prompt leaves its categories, so the empty
  // list has to travel rather than being read as "no change".
  it('passes an empty list when the last category is turned off', async () => {
    const { onSubmit, categoryToggle } = renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        categories: ['c1'],
        createdAt: 1,
        updatedAt: 1,
      },
    });
    fireEvent.click(categoryToggle('디버깅'));

    fireEvent.click(saveButton());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('n', 'c', []));
  });

  it('shows the categories of the prompt being edited as already on', () => {
    const { categoryToggle } = renderForm({
      editing: {
        id: 'p1',
        name: 'n',
        content: 'c',
        categories: ['c2'],
        createdAt: 1,
        updatedAt: 1,
      },
    });
    expect(categoryToggle('리뷰')).toHaveAttribute('aria-pressed', 'true');
    expect(categoryToggle('디버깅')).toHaveAttribute('aria-pressed', 'false');
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
