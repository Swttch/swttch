import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromptVariablesModal } from '../index';

function renderModal(content: string, names: string[]) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <PromptVariablesModal
      content={content}
      names={names}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );
  const fields = screen.getAllByRole('textbox') as HTMLInputElement[];
  // Cancel then Insert, in DOM order, which is what makes Shift+Tab from Insert
  // land on Cancel without any handler of our own.
  const [cancelButton, insertButton] = screen.getAllByRole('button');
  return { onSubmit, onCancel, fields, cancelButton, insertButton };
}

describe('PromptVariablesModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('puts the caret in the first field', () => {
    const { fields } = renderModal('{{a}} {{b}}', ['a', 'b']);
    expect(document.activeElement).toBe(fields[0]);
  });

  it('moves to the next empty field on Enter', () => {
    const { fields } = renderModal('{{a}} {{b}}', ['a', 'b']);

    fireEvent.change(fields[0], { target: { value: 'A' } });
    fireEvent.keyDown(fields[0], { key: 'Enter' });

    expect(document.activeElement).toBe(fields[1]);
  });

  it('skips a field that already has a value', () => {
    const { fields } = renderModal('{{a}} {{b}} {{c}}', ['a', 'b', 'c']);
    fireEvent.change(fields[1], { target: { value: 'B' } });

    fireEvent.change(fields[0], { target: { value: 'A' } });
    fireEvent.keyDown(fields[0], { key: 'Enter' });

    expect(document.activeElement).toBe(fields[2]);
  });

  it('wraps back to a field left empty earlier', () => {
    const { fields } = renderModal('{{a}} {{b}}', ['a', 'b']);
    fireEvent.change(fields[1], { target: { value: 'B' } });
    // The caret has to actually be in the last field, or this passes on the
    // autofocus alone and proves nothing.
    fields[1].focus();
    expect(document.activeElement).toBe(fields[1]);

    fireEvent.keyDown(fields[1], { key: 'Enter' });

    expect(document.activeElement).toBe(fields[0]);
  });

  it('moves to Insert, not Cancel, once every field has a value', () => {
    const { fields, insertButton } = renderModal('{{a}} {{b}}', ['a', 'b']);
    fireEvent.change(fields[0], { target: { value: 'A' } });
    fireEvent.change(fields[1], { target: { value: 'B' } });

    fireEvent.keyDown(fields[1], { key: 'Enter' });

    expect(document.activeElement).toBe(insertButton);
  });

  it('does not submit on Enter, so the last confirmation is the visible button', () => {
    const { fields, onSubmit } = renderModal('{{a}}', ['a']);
    fireEvent.change(fields[0], { target: { value: 'A' } });

    fireEvent.keyDown(fields[0], { key: 'Enter' });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  // This dialog is opened by an Enter press on the panel behind it. A key still
  // held down keeps producing keydowns, and those must not walk the caret past
  // the first field before the user has read it.
  it('ignores the auto-repeat of an Enter that was already held', () => {
    const { fields } = renderModal('{{a}} {{b}}', ['a', 'b']);
    fireEvent.change(fields[0], { target: { value: 'A' } });
    fireEvent.keyDown(fields[0], { key: 'Enter', repeat: true });

    expect(document.activeElement).toBe(fields[0]);
  });

  // A dialog opened with the mouse never sees an Enter keyup, so a guard that
  // waited for one left its first Enter dead.
  it('acts on the first Enter when the dialog was opened by a click', () => {
    const { fields } = renderModal('{{a}} {{b}}', ['a', 'b']);
    fireEvent.change(fields[0], { target: { value: 'A' } });
    fireEvent.keyDown(fields[0], { key: 'Enter' });

    expect(document.activeElement).toBe(fields[1]);
  });

  it('submits the typed values when Insert is pressed', () => {
    const { fields, insertButton, onSubmit } = renderModal('{{a}} {{b}}', ['a', 'b']);
    fireEvent.change(fields[0], { target: { value: 'A' } });
    fireEvent.change(fields[1], { target: { value: 'B' } });

    fireEvent.click(insertButton);

    expect(onSubmit).toHaveBeenCalledWith({ a: 'A', b: 'B' });
  });

  it('cancels on Escape', () => {
    const { fields, onCancel } = renderModal('{{a}}', ['a']);
    fireEvent.keyDown(fields[0], { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows a live preview of what Insert will produce', () => {
    const { fields } = renderModal('{{a}} and {{a}} and {{b}}', ['a', 'b']);
    fireEvent.change(fields[0], { target: { value: 'X' } });
    fireEvent.change(fields[1], { target: { value: 'Y' } });

    expect(screen.getByText('X and X and Y')).toBeInTheDocument();
  });
});
