import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const reportSponsorGate = vi.fn();
vi.mock('@/utils/reportSponsorGate', () => ({
  reportSponsorGate: (...a: unknown[]) => reportSponsorGate(...a),
}));
const openSettingsAt = vi.fn();
vi.mock('@/utils/openSettingsAt', () => ({
  openSettingsAt: (...a: unknown[]) => openSettingsAt(...a),
}));

import { SponsorGate, SponsorGateStep, SponsorGateSurface } from '@/shared';
import { MoreInSessionNotice, EdgeSponsorHint } from '../SponsorGateNotice';

beforeEach(() => {
  cleanup();
  reportSponsorGate.mockReset();
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
    expect(reportSponsorGate).not.toHaveBeenCalled();
  });
});

describe('EdgeSponsorHint', () => {
  it('explains the stopped arrow and offers the way past it', () => {
    render(<EdgeSponsorHint from={SponsorGateSurface.Viewer} />);

    expect(
      screen.getByText('Moving to other messages’ assets is a little perk I keep for sponsors'),
    ).toBeInTheDocument();
    expect(screen.getByText('Learn more')).toBeInTheDocument();
  });

  it('records the invitation being followed, against the feature that raised it', () => {
    // The numerator: without this the denominator alone says nothing. The gate
    // has to be named too — several features raise this same offer now, and a
    // click nobody attributed cannot be divided by anything.
    render(<EdgeSponsorHint from={SponsorGateSurface.Viewer} />);

    fireEvent.click(screen.getByText('Learn more'));

    expect(reportSponsorGate).toHaveBeenCalledWith(SponsorGate.Assets, SponsorGateStep.Clicked, {
      from: SponsorGateSurface.Viewer,
    });
    expect(openSettingsAt).toHaveBeenCalledTimes(1);
  });

  it('attributes the same button to the screen it was pressed on', () => {
    // Both surfaces render this identical button. If the surface did not travel
    // with the report, the Assets screen's clicks would be indistinguishable
    // from the viewer's and neither could be told apart afterwards.
    render(<EdgeSponsorHint from={SponsorGateSurface.AssetsScreen} />);

    fireEvent.click(screen.getByText('Learn more'));

    expect(reportSponsorGate).toHaveBeenCalledWith(SponsorGate.Assets, SponsorGateStep.Clicked, {
      from: SponsorGateSurface.AssetsScreen,
    });
  });
});
