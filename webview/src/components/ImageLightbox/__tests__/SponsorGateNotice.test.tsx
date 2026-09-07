import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const reportAssetActivity = vi.fn();
vi.mock('@/utils/reportAssetActivity', () => ({
  reportAssetActivity: (...a: unknown[]) => reportAssetActivity(...a),
}));
const openSettingsAt = vi.fn();
vi.mock('@/utils/openSettingsAt', () => ({
  openSettingsAt: (...a: unknown[]) => openSettingsAt(...a),
}));

import { MoreInSessionNotice, EdgeSponsorHint } from '../SponsorGateNotice';

beforeEach(() => {
  cleanup();
  reportAssetActivity.mockReset();
  openSettingsAt.mockReset();
});

/*
  The two halves of the gate ask for different things, and this is where that
  split is pinned down.

  The notice corrects a count: the panel says "1 / 1" while the session holds
  more, so it names the rest. Whoever reads it wants to SEE those, and all of
  them are already theirs to look at.

  The arrow tooltip answers a blocked press. Whoever hits that wants to keep
  MOVING, which is the thing sponsorship actually buys.
*/

describe('MoreInSessionNotice', () => {
  it('names how many are outside the count below it', () => {
    render(<MoreInSessionNotice count={23} onShowAll={vi.fn()} />);

    expect(screen.getByText('23 more in this session')).toBeInTheDocument();
  });

  it('offers to show them rather than to sell', () => {
    const onShowAll = vi.fn();
    render(<MoreInSessionNotice count={23} onShowAll={onShowAll} />);

    fireEvent.click(screen.getByText('Show all'));

    expect(onShowAll).toHaveBeenCalledTimes(1);
    expect(openSettingsAt).not.toHaveBeenCalled();
    // Nothing was followed to the sponsor page, so nothing may be counted as if
    // it had been — that number is the conversion rate's numerator.
    expect(reportAssetActivity).not.toHaveBeenCalledWith('gate_clicked');
  });
});

describe('EdgeSponsorHint', () => {
  it('explains the stopped arrow and offers the way past it', () => {
    render(<EdgeSponsorHint />);

    expect(
      screen.getByText('Moving to other messages’ assets is a little perk I keep for sponsors'),
    ).toBeInTheDocument();
    expect(screen.getByText('Learn more')).toBeInTheDocument();
  });

  it('records the invitation being followed', () => {
    // The numerator: without this the denominator alone says nothing.
    render(<EdgeSponsorHint />);

    fireEvent.click(screen.getByText('Learn more'));

    expect(reportAssetActivity).toHaveBeenCalledWith('gate_clicked');
    expect(openSettingsAt).toHaveBeenCalledTimes(1);
  });
});
