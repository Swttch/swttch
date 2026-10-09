import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('ConfirmDialog — checkbox', () => {
  const baseProps = {
    title: 'Enable it?',
    message: 'This changes something.',
    confirmLabel: 'Enable',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('draws no checkbox unless one is asked for, and confirms with false', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('starts the box where it was told to and reports it when confirming', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onConfirm={onConfirm}
        checkbox={{ label: 'In all sessions', defaultChecked: true }}
      />,
    );

    const box = screen.getByRole('checkbox', { name: 'In all sessions' }) as HTMLInputElement;
    expect(box.checked).toBe(true);

    fireEvent.click(box);
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }));

    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it('draws the box between the message and the buttons, with its badge beside the label', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        checkbox={{ label: 'In all sessions', defaultChecked: false, badge: <span>badge</span> }}
      />,
    );

    const message = screen.getByText('This changes something.');
    const label = screen.getByText('In all sessions').closest('label') as HTMLElement;
    const confirm = screen.getByRole('button', { name: 'Enable' });

    expect(message.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label).toHaveTextContent('badge');
  });

  it('asks before the box turns on and leaves it off when refused', async () => {
    const beforeCheck = vi.fn().mockResolvedValue(false);
    render(
      <ConfirmDialog
        {...baseProps}
        checkbox={{ label: 'In all sessions', defaultChecked: false, beforeCheck }}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(beforeCheck).toHaveBeenCalledTimes(1));

    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('turns the box on once the ask is granted, and never asks when it turns off', async () => {
    const beforeCheck = vi.fn().mockResolvedValue(true);
    render(
      <ConfirmDialog
        {...baseProps}
        checkbox={{ label: 'In all sessions', defaultChecked: false, beforeCheck }}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true));

    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(beforeCheck).toHaveBeenCalledTimes(1);
  });

  it('puts a hint directly under the label, so it explains the box and not the message', () => {
    render(
      <ConfirmDialog
        {...baseProps}
        checkbox={{ label: 'In all sessions', defaultChecked: false, hint: 'Applies to every new session.' }}
      />,
    );

    const label = screen.getByText('In all sessions').closest('label') as HTMLElement;
    const hint = screen.getByText('Applies to every new session.');
    const confirm = screen.getByRole('button', { name: 'Enable' });

    // Same block as the label, right after it, and before the buttons.
    expect(hint.parentElement).toBe(label.parentElement);
    expect(label.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hint.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('draws no hint line when none is given', () => {
    render(<ConfirmDialog {...baseProps} checkbox={{ label: 'In all sessions', defaultChecked: false }} />);

    const label = screen.getByText('In all sessions').closest('label') as HTMLElement;
    expect(label.parentElement?.querySelectorAll('p')).toHaveLength(0);
  });
});

describe('ConfirmDialog — locked checkbox', () => {
  const baseProps = {
    title: 'Enable it?',
    message: 'This changes something.',
    confirmLabel: 'Enable',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  const lockedBox = (extra: Partial<React.ComponentProps<typeof ConfirmDialog>['checkbox'] & object> = {}) => ({
    label: 'In all sessions',
    defaultChecked: true,
    locked: true,
    ...extra,
  });

  it('shows the box dimmed and unticked even when it would start ticked', () => {
    render(<ConfirmDialog {...baseProps} checkbox={lockedBox()} />);

    const box = screen.getByRole('checkbox') as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box).toBeDisabled();
    expect(box.closest('label')).toHaveClass('opacity-60');
  });

  it('runs onLockedClick and cancels when the label is pressed', () => {
    const onLockedClick = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} checkbox={lockedBox({ onLockedClick })} />);

    fireEvent.click(screen.getByText('In all sessions'));

    expect(onLockedClick).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('lets presses on the box itself through to the label, which is what leads on', () => {
    const onLockedClick = vi.fn();
    render(<ConfirmDialog {...baseProps} checkbox={lockedBox({ onLockedClick })} />);

    const box = screen.getByRole('checkbox') as HTMLInputElement;
    // jsdom does not apply pointer-events, so the class that routes a press on
    // the box to the label is what is checked, and the label's own press above.
    expect(box).toHaveClass('pointer-events-none');
    expect(box.closest('label')).not.toHaveClass('pointer-events-none');
    expect(box.checked).toBe(false);
  });

  it('reports the locked box as shown once, on mount', () => {
    const onLockedShown = vi.fn();
    const { rerender } = render(<ConfirmDialog {...baseProps} checkbox={lockedBox({ onLockedShown })} />);
    rerender(<ConfirmDialog {...baseProps} checkbox={lockedBox({ onLockedShown })} />);

    expect(onLockedShown).toHaveBeenCalledTimes(1);
  });

  it('does not report an open box as shown, nor treat its label as a way out', () => {
    const onLockedShown = vi.fn();
    const onLockedClick = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        {...baseProps}
        onCancel={onCancel}
        checkbox={{ label: 'In all sessions', defaultChecked: false, onLockedShown, onLockedClick }}
      />,
    );

    fireEvent.click(screen.getByText('In all sessions'));

    expect(onLockedShown).not.toHaveBeenCalled();
    expect(onLockedClick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox')).not.toBeDisabled();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
  });
});
