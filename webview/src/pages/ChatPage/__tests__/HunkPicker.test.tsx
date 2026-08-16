/**
 * The picker is the only place a reviewer can narrow an edit, so what it shows
 * and what it reports have to agree — a tick that does not travel, or a count
 * that lies, sends the wrong change to disk.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HunkPicker } from '../HunkPicker';
import type { PreviewHunk } from '@/hooks/usePendingDiffPreview';

const hunks: PreviewHunk[] = [
  { index: 0, oldStart: 3, oldLines: 3, newStart: 3, newLines: 3, lines: [' ctx', '-old one', '+new one'] },
  { index: 1, oldStart: 30, oldLines: 3, newStart: 30, newLines: 3, lines: [' ctx', '-old two', '+new two'] },
];

function setup(accepted: number[] = [0, 1]) {
  const onToggle = vi.fn();
  const onSetAll = vi.fn();
  render(
    <HunkPicker
      filePath="/project/src/config.ts"
      hunks={hunks}
      acceptedHunks={accepted}
      onToggle={onToggle}
      onSetAll={onSetAll}
    />,
  );
  return { onToggle, onSetAll };
}

describe('HunkPicker', () => {
  it('shows the file being changed by name', () => {
    setup();
    expect(screen.getByText('config.ts')).toBeInTheDocument();
  });

  it('renders each hunk with its added and removed lines', () => {
    setup();
    expect(screen.getByText('-old one')).toBeInTheDocument();
    expect(screen.getByText('+new one')).toBeInTheDocument();
    expect(screen.getByText('-old two')).toBeInTheDocument();
  });

  it('starts with every hunk ticked, so doing nothing approves the whole edit', () => {
    setup();
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.every((b) => b.checked)).toBe(true);
  });

  it('reports the hunk that was clicked', () => {
    const { onToggle } = setup();
    const boxes = screen.getAllByRole('checkbox');
    fireEvent.click(boxes[1]);
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('reflects a narrowed selection rather than staying all-ticked', () => {
    setup([0]);
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
  });

  it('offers to clear when everything is selected, and to select all otherwise', () => {
    const { onSetAll } = setup([0, 1]);
    fireEvent.click(screen.getByRole('button'));
    expect(onSetAll).toHaveBeenCalledWith(false);
  });

  it('offers select-all once something has been unticked', () => {
    const { onSetAll } = setup([0]);
    fireEvent.click(screen.getByRole('button'));
    expect(onSetAll).toHaveBeenCalledWith(true);
  });

  it('renders nothing when there are no hunks', () => {
    // Not every permission request has a diff — a Bash command has none.
    const { container } = render(
      <HunkPicker
        filePath="/x.ts"
        hunks={[]}
        acceptedHunks={[]}
        onToggle={vi.fn()}
        onSetAll={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
