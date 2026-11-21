import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RunViewActions, alternativeViewOf } from '../RunViewControls';

describe('the alternative view button of the run title row', () => {
  it('is a tab of its own from the window and from the side panel, the side panel from a page or a tab', () => {
    expect(alternativeViewOf('center')).toBe('tab');
    expect(alternativeViewOf('side')).toBe('tab');
    expect(alternativeViewOf('page')).toBe('side');
    expect(alternativeViewOf('tab')).toBe('side');
  });

  it('from the window, opens the run in a tab', () => {
    const onOpenInNewTab = vi.fn();
    render(<RunViewActions variant="simple" placement="center" onOpenInNewTab={onOpenInNewTab} onPlacementChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open in new tab' }));
    expect(onOpenInNewTab).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'Side view' })).not.toBeInTheDocument();
  });

  it('from a page, puts the run back in the side panel', () => {
    const onPlacementChange = vi.fn();
    render(<RunViewActions variant="simple" placement="page" onOpenInNewTab={vi.fn()} onPlacementChange={onPlacementChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Side view' }));
    expect(onPlacementChange).toHaveBeenCalledWith('side');
    expect(screen.queryByRole('button', { name: 'Open in new tab' })).not.toBeInTheDocument();
  });

  it('moves into More at the last level', () => {
    render(<RunViewActions variant="simple" placement="page" onOpenInNewTab={vi.fn()} onPlacementChange={vi.fn()} level={3} />);
    expect(screen.queryByRole('button', { name: 'Side view' })).not.toBeInTheDocument();
  });
});
