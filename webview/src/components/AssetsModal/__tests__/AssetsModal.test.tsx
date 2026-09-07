import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { SessionAsset } from '@/shared';

const assets = vi.fn<() => SessionAsset[] | undefined>(() => []);
const ensure = vi.fn();
const loaded = vi.fn<() => Record<string, string>>(() => ({}));
const isSponsor = vi.fn(() => false);

vi.mock('@/hooks/useSessionAssets', async () => {
  const actual = await vi.importActual<typeof import('@/hooks/useSessionAssets')>(
    '@/hooks/useSessionAssets',
  );
  return {
    assetKey: actual.assetKey,
    useSessionAssets: () => assets(),
    useSessionAssetLoader: () => ({ loaded: loaded(), ensure }),
  };
});
vi.mock('@/hooks/queries/useSponsorStatus', () => ({
  useSponsorStatus: () => ({ isSponsor: isSponsor() }),
}));

// The pin control reads and writes the real dock layout, which lives in
// settings. The app always renders this inside SettingsProvider; the test does
// not, so the layout is stood in for here.
const dockVisible = vi.fn<() => DockItemId[]>(() => []);
const saveDock = vi.fn();
vi.mock('@/pages/ChatPage/SessionHeader/dock/useDockLayout', () => ({
  useDockLayout: () => ({
    layout: { order: [], visible: dockVisible() },
    save: saveDock,
  }),
}));

import { DockItemId } from '@/types/settings';
import { AssetsModal, groupByMessage } from '../index';

function asset(entryUuid: string, blockIndex: number, preview = '', timestamp = '2026-09-06T01:00:00.000Z'): SessionAsset {
  return { entryUuid, blockIndex, mediaType: 'image/png', timestamp, byteSize: 3, messagePreview: preview };
}

/** The gate line, kept in one place so a copy change is one edit here. */
const SPONSOR_HINT = 'Moving to other messages’ assets is a little perk I keep for sponsors';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  assets.mockReturnValue([]);
  loaded.mockReturnValue({});
  isSponsor.mockReturnValue(false);
  dockVisible.mockReturnValue([]);
});

describe('groupByMessage', () => {
  it('folds the flat index back into one row per message', () => {
    const groups = groupByMessage([
      asset('u1', 1, 'first'),
      asset('u1', 2, 'first'),
      asset('u2', 0, 'second'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].assets).toHaveLength(2);
    expect(groups[0].messagePreview).toBe('first');
    expect(groups[1].assets).toHaveLength(1);
  });

  it('keeps transcript order rather than merging entries seen twice', () => {
    // Grouping by a map would collapse a uuid that reappears later and move the
    // images out of the order the conversation had.
    const groups = groupByMessage([asset('u1', 0), asset('u2', 0), asset('u1', 1)]);

    expect(groups.map((g) => g.entryUuid)).toEqual(['u1', 'u2', 'u1']);
  });

  it('handles an empty index', () => {
    expect(groupByMessage([])).toEqual([]);
  });
});

describe('AssetsModal', () => {
  it('says so when the session has no attachments', () => {
    render(<AssetsModal onClose={vi.fn()} />);

    expect(screen.getByText('No assets attached in this session yet')).toBeInTheDocument();
  });

  it('lays the session out as one block per message, captioned by the prompt', () => {
    assets.mockReturnValue([asset('u1', 1, 'compare these'), asset('u2', 0, 'and this one')]);

    render(<AssetsModal onClose={vi.fn()} />);

    expect(screen.getByText('compare these')).toBeInTheDocument();
    expect(screen.getByText('and this one')).toBeInTheDocument();
  });

  it('shows how many images the session holds', () => {
    assets.mockReturnValue([asset('u1', 1), asset('u1', 2), asset('u2', 0)]);

    render(<AssetsModal onClose={vi.fn()} />);

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not draw an image before the loader has its bytes', () => {
    // Thumbnails fetch themselves on scroll; drawing an <img> with no src would
    // show a broken-image glyph for every tile below the fold.
    assets.mockReturnValue([asset('u1', 1)]);

    const { baseElement } = render(<AssetsModal onClose={vi.fn()} />);

    // Queried by tag: the tile's img is alt="" on purpose (its button already
    // carries the label), which removes it from the accessibility tree.
    expect(baseElement.querySelector('img')).toBeNull();
    expect(screen.getByText('…')).toBeInTheDocument();
  });

  it('draws the image once the loader has it', () => {
    assets.mockReturnValue([asset('u1', 1)]);
    loaded.mockReturnValue({ 'u1:1': 'data:image/png;base64,AAA' });

    const { baseElement } = render(<AssetsModal onClose={vi.fn()} />);

    expect(baseElement.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  it('keeps a non-sponsor inside the message they clicked', () => {
    // Same rule as the transcript, so the gate does not depend on which screen
    // the viewer was opened from.
    assets.mockReturnValue([asset('u1', 1), asset('u2', 0), asset('u2', 1)]);
    loaded.mockReturnValue({ 'u1:1': 'A', 'u2:0': 'B', 'u2:1': 'C' });

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Open asset')[1]);

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('1 more in this session')).toBeInTheDocument();
  });

  it('lets a sponsor step across the whole session', () => {
    assets.mockReturnValue([asset('u1', 1), asset('u2', 0), asset('u2', 1)]);
    loaded.mockReturnValue({ 'u1:1': 'A', 'u2:0': 'B', 'u2:1': 'C' });
    isSponsor.mockReturnValue(true);

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Open asset')[1]);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.queryByText(/more in this session/)).toBeNull();
  });

  it('tells a non-sponsor what sponsorship adds, without blocking the screen', () => {
    // Someone who opens this screen and closes it without clicking an image
    // would otherwise never learn the feature exists.
    assets.mockReturnValue([asset('u1', 1)]);

    render(<AssetsModal onClose={vi.fn()} />);

    expect(screen.getByText(SPONSOR_HINT)).toBeInTheDocument();
    expect(screen.getByLabelText('Open asset')).toBeInTheDocument();
  });

  it('does not nag a sponsor about sponsoring', () => {
    assets.mockReturnValue([asset('u1', 1)]);
    isSponsor.mockReturnValue(true);

    render(<AssetsModal onClose={vi.fn()} />);

    expect(screen.queryByText(SPONSOR_HINT)).toBeNull();
  });

  it('says nothing about sponsorship when there are no images to speak of', () => {
    assets.mockReturnValue([]);

    render(<AssetsModal onClose={vi.fn()} />);

    expect(screen.queryByText(SPONSOR_HINT)).toBeNull();
  });

  it('offers to pin itself into the dock, and says so as an action', () => {
    // A newly shipped dock item starts hidden, so without this the dock's only
    // advertisement is a ⋮ menu most people never open.
    assets.mockReturnValue([asset('u1', 1)]);

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Pin to dock'));

    expect(saveDock).toHaveBeenCalledWith(
      expect.objectContaining({ visible: [DockItemId.ASSETS] }),
    );
  });

  it('offers to unpin once it is already in the dock', () => {
    assets.mockReturnValue([asset('u1', 1)]);
    dockVisible.mockReturnValue([DockItemId.ASSETS]);

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('Unpin from dock'));

    expect(saveDock).toHaveBeenCalledWith(expect.objectContaining({ visible: [] }));
  });

  it('offers a non-sponsor the same way out of the viewer as the transcript does', () => {
    // Built separately, the two notices drifted: this one had no link to follow
    // and reported nothing, on the very screen the gate is designed around.
    assets.mockReturnValue([asset('u1', 1), asset('u2', 0)]);
    loaded.mockReturnValue({ 'u1:1': 'A', 'u2:0': 'B' });

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Open asset')[0]);

    // Scoped to the notice itself: the screen header carries its own link, and
    // finding that one would prove nothing about the viewer.
    const notice = screen.getByText('1 more in this session').parentElement;
    expect(notice).not.toBeNull();
    expect(within(notice as HTMLElement).getByText('Show all')).toBeInTheDocument();
  });

  it('sends "Show all" back to the grid rather than to the sponsor page', () => {
    // The grid is already open behind the viewer, and every thumbnail on it is
    // this user's to look at. Answering "where are the rest?" with a payment
    // page would be selling at a question.
    assets.mockReturnValue([asset('u1', 1), asset('u2', 0)]);
    loaded.mockReturnValue({ 'u1:1': 'A', 'u2:0': 'B' });

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Open asset')[0]);
    fireEvent.click(screen.getByText('Show all'));

    expect(screen.queryByAltText('Full size')).toBeNull();
    expect(screen.getAllByLabelText('Open asset')).toHaveLength(2);
  });

  it('closes on Escape while the viewer is not up', () => {
    const onClose = vi.fn();
    assets.mockReturnValue([asset('u1', 1)]);
    render(<AssetsModal onClose={onClose} />);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Escape to the viewer while it is open', () => {
    // Otherwise one press would close both, and the user would lose the screen
    // they were browsing just by dismissing an image.
    const onClose = vi.fn();
    assets.mockReturnValue([asset('u1', 1)]);
    loaded.mockReturnValue({ 'u1:1': 'A' });
    render(<AssetsModal onClose={onClose} />);

    fireEvent.click(screen.getByLabelText('Open asset'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
