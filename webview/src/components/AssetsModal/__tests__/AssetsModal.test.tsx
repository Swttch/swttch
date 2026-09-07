import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
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

import { AssetsModal, groupByMessage } from '../index';

function asset(entryUuid: string, blockIndex: number, preview = '', timestamp = '2026-09-06T01:00:00.000Z'): SessionAsset {
  return { entryUuid, blockIndex, mediaType: 'image/png', timestamp, byteSize: 3, messagePreview: preview };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  assets.mockReturnValue([]);
  loaded.mockReturnValue({});
  isSponsor.mockReturnValue(false);
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

    expect(screen.getByText('No images attached in this session yet')).toBeInTheDocument();
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
    fireEvent.click(screen.getAllByLabelText('Open image')[1]);

    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByText('1 more in this session')).toBeInTheDocument();
  });

  it('lets a sponsor step across the whole session', () => {
    assets.mockReturnValue([asset('u1', 1), asset('u2', 0), asset('u2', 1)]);
    loaded.mockReturnValue({ 'u1:1': 'A', 'u2:0': 'B', 'u2:1': 'C' });
    isSponsor.mockReturnValue(true);

    render(<AssetsModal onClose={vi.fn()} />);
    fireEvent.click(screen.getAllByLabelText('Open image')[1]);

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.queryByText(/more in this session/)).toBeNull();
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

    fireEvent.click(screen.getByLabelText('Open image'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
