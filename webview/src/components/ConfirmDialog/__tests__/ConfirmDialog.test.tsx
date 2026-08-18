import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../index';

describe('ConfirmDialog', () => {
  const baseProps = {
    title: 'Delete Session',
    message: 'Are you sure you want to delete this session?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders title and message', () => {
    render(<ConfirmDialog {...baseProps} />);

    expect(screen.getByText('Delete Session')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this session?')).toBeInTheDocument();
  });

  it('shows default button labels when confirmLabel and cancelLabel are not provided', () => {
    render(<ConfirmDialog {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows custom button labels when provided', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        confirmLabel="Yes, delete"
        cancelLabel="No, keep it"
      />
    );

    expect(screen.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No, keep it' })).toBeInTheDocument();
  });

  it('calls onConfirm when the Confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the Cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not globally force-confirm on Enter — the focused button handles it', () => {
    // Regression guard: a global Enter handler that always called onConfirm meant
    // Enter triggered confirm even when the user had Cancel focused. With focus
    // trapped inside the dialog, Enter must be left to the focused button instead.
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);

    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('focuses the confirm button on mount so Enter activates the dialog, not the chat input', () => {
    render(<ConfirmDialog {...baseProps} />);

    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
  });

  it('restores focus to the opener (e.g. chat input) when the dialog closes', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    expect(opener).toHaveFocus();

    const { unmount } = render(<ConfirmDialog {...baseProps} />);
    // Dialog took focus while open
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();

    unmount();
    // Focus handed back to the opener on close (confirm or cancel both unmount)
    expect(opener).toHaveFocus();

    document.body.removeChild(opener);
  });

  it('calls onCancel when the Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when the backdrop is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />);

    // The backdrop is the outermost overlay element (fixed inset-0)
    const backdrop = screen.getByTestId('confirm-dialog-backdrop');
    fireEvent.click(backdrop);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // Where "no" is a recorded answer, leaving without choosing has to stay
  // separate from giving it. onDismiss is how a caller says so.
  it('routes Escape to onDismiss when one is given', () => {
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} onDismiss={onDismiss} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('routes a backdrop click to onDismiss when one is given', () => {
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('confirm-dialog-backdrop'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows a close button only when onDismiss is given', () => {
    const { unmount } = render(<ConfirmDialog {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    unmount();

    const onDismiss = vi.fn();
    render(<ConfirmDialog {...baseProps} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('still answers its buttons with onDismiss given', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onDismiss={onDismiss}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('applies danger style classes to the Confirm button when variant is danger', () => {
    render(<ConfirmDialog {...baseProps} variant="danger" />);

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });

    expect(confirmButton).toHaveClass('bg-state-error-fg');
  });

  it('does not apply danger style classes to the Confirm button when variant is default', () => {
    render(<ConfirmDialog {...baseProps} variant="default" />);

    const confirmButton = screen.getByRole('button', { name: 'Confirm' });

    expect(confirmButton).not.toHaveClass('bg-state-error-fg');
  });

  it('renders into document.body via Portal', () => {
    const { baseElement } = render(<ConfirmDialog {...baseProps} />);

    // When using a Portal, the dialog is appended to document.body,
    // not inside the container div that render() creates.
    // baseElement is document.body, so we verify the dialog is a direct
    // descendant of body rather than nested inside the default container.
    const dialog = screen.getByRole('dialog');
    expect(document.body.contains(dialog)).toBe(true);

    // The default render container should NOT contain the dialog
    // (it should be in a portal sibling, not the wrapper div)
    const wrapper = baseElement.firstElementChild; // the default <div> render target
    expect(wrapper?.contains(dialog)).toBe(false);
  });
});
