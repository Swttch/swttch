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
import { Tooltip } from '@/components/Tooltip';
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
  });

  it('is not counted as an offer, because it carries no link to one', () => {
    // This notice sends people to the Assets screen, not to the sponsor page.
    // Counting it would inflate the denominator with people who were never
    // actually offered anything.
    render(<MoreInSessionNotice count={23} onShowAll={vi.fn()} />);

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
    // from the viewer's.
    render(<EdgeSponsorHint from={SponsorGateSurface.AssetsScreen} />);

    fireEvent.click(screen.getByText('Learn more'));

    expect(reportSponsorGate).toHaveBeenCalledWith(SponsorGate.Assets, SponsorGateStep.Clicked, {
      from: SponsorGateSurface.AssetsScreen,
    });
  });

  it('does not count itself as shown merely by existing', () => {
    // The load-bearing rule of this measurement, and the one that was wrong.
    // This hint lives inside a Tippy tooltip, and Tippy's headless render
    // commits its content while the tooltip is still CLOSED. A hint that
    // reported on mount would therefore fire for arrows nobody ever hovered —
    // which is how the funnel came to read 41 shown against 0 followed.
    //
    // Whoever displays it reports the showing instead, at the moment it is
    // genuinely visible (the viewer hangs that on Tooltip's onShow).
    render(<EdgeSponsorHint from={SponsorGateSurface.Viewer} />);

    expect(
      reportSponsorGate.mock.calls.filter((c) => c[1] === SponsorGateStep.Seen),
    ).toHaveLength(0);
  });

  it('stays invisible, and uncounted, inside a tooltip nobody opened', () => {
    // The same rule seen from outside: mounted into a closed tooltip, the link
    // is not in the document and nothing has been reported.
    render(
      <Tooltip content={<EdgeSponsorHint from={SponsorGateSurface.Viewer} />} interactive>
        <button type="button">arrow</button>
      </Tooltip>,
    );

    expect(screen.queryByText('Learn more')).toBeNull();
    expect(reportSponsorGate).not.toHaveBeenCalled();
  });
});

describe('Tooltip', () => {
  it('does not announce a showing before anyone has opened it', () => {
    // What the viewer hangs its "shown" report on. Mounting cannot stand in for
    // it — Tippy does that far too early to mean anything — so this signal must
    // stay silent until the tooltip really opens.
    const onShow = vi.fn();
    render(
      <Tooltip content="hi" onShow={onShow}>
        <button type="button">target</button>
      </Tooltip>,
    );

    expect(onShow).not.toHaveBeenCalled();
  });
});
