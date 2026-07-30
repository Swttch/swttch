import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ApprovalPanel } from '../ApprovalPanel';
import type { OptionItem } from '../ApprovalPanel/OptionButton';

const options: OptionItem[] = [
  { key: '1', label: 'Yes' },
  { key: '2', label: 'Yes, for this session' },
  { key: '3', label: 'No' },
];

function renderPanel(overrides: Partial<Parameters<typeof ApprovalPanel>[0]> = {}) {
  const props = {
    title: 'Run this command?',
    options,
    onOptionSelect: vi.fn<(index: number) => void>(),
    onCancel: vi.fn<() => void>(),
    ...overrides,
  };
  render(<ApprovalPanel {...props} />);
  return props;
}

describe('ApprovalPanel — clickable "Esc to cancel"', () => {
  it('cancels when the "Esc to cancel" hint itself is clicked', () => {
    const onCancel = vi.fn<() => void>();
    renderPanel({ onCancel });

    fireEvent.click(screen.getByText('Esc to cancel'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('exposes the hint as a real button so it is keyboard reachable', () => {
    renderPanel();

    const hint = screen.getByRole('button', { name: 'Esc to cancel' });
    expect(hint).toBeInTheDocument();
  });
});

describe('ApprovalPanel — collapse / expand', () => {
  let onOptionSelect: ReturnType<typeof vi.fn<(index: number) => void>>;
  let onCancel: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    onOptionSelect = vi.fn<(index: number) => void>();
    onCancel = vi.fn<() => void>();
  });

  it('renders a collapse control while expanded', () => {
    renderPanel({ onOptionSelect, onCancel });

    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
  });

  it('hides the options and shows a one-line summary bar once collapsed', () => {
    renderPanel({ onOptionSelect, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));

    // Options are gone…
    expect(screen.queryByText('Yes, for this session')).not.toBeInTheDocument();
    // …but the title survives in the summary bar, next to an expand control.
    expect(screen.getByText('Run this command?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument();
  });

  it('restores the options when expanded again', () => {
    renderPanel({ onOptionSelect, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));

    expect(screen.getByText('Yes, for this session')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
  });

  it('ignores number-key selection while collapsed so reading cannot approve by accident', () => {
    renderPanel({ onOptionSelect, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.keyDown(window, { key: '1' });

    expect(onOptionSelect).not.toHaveBeenCalled();
  });

  it('ignores Enter while collapsed', () => {
    renderPanel({ onOptionSelect, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(onOptionSelect).not.toHaveBeenCalled();
  });

  it('still cancels on Escape while collapsed', () => {
    renderPanel({ onOptionSelect, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onCancel).toHaveBeenCalled();
  });

  it('accepts number-key selection again after expanding', () => {
    renderPanel({ onOptionSelect, onCancel });

    fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand' }));
    fireEvent.keyDown(window, { key: '1' });

    expect(onOptionSelect).toHaveBeenCalledWith(0);
  });
});
