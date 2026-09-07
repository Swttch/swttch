import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ImageBlockDto } from '../../../../../dto/message/ContentBlockDto';

// The session/working-dir contexts and the gallery hook are exercised by
// useSessionAssetGallery's own tests. Here the concern is only the thumbnail
// grid and which position it opens the viewer on, so the surroundings are
// stubbed rather than mounted.
const gallery = vi.fn();
vi.mock('@/contexts/SessionContext', () => ({ useSessionContext: () => ({ currentSessionId: 's1' }) }));
vi.mock('@/contexts/WorkingDirContext', () => ({ useWorkingDir: () => ({ workingDirectory: '/w' }) }));
vi.mock('@/hooks/useSessionAssetGallery', () => ({
  useSessionAssetGallery: (params: { localSrcs: string[]; openedLocalIndex: number | null }) =>
    gallery(params),
}));

import { ImageAttachments } from '../ImageAttachments';

/** Minimal stand-in for the wire shape; only `source` is read for rendering. */
function image(data: string): ImageBlockDto {
  return { source: { type: 'base64', media_type: 'image/png', data } } as ImageBlockDto;
}

const IMAGES = [image('AAA'), image('BBB'), image('CCC')];

/** Default stub: the ungated case, where the viewer shows just this message. */
function localOnlyGallery(lockedCount = 0, hasMoreInSession = lockedCount > 0) {
  return (params: { localSrcs: string[]; openedLocalIndex: number | null }) => ({
    srcs: params.localSrcs,
    initialIndex: params.openedLocalIndex ?? 0,
    lockedCount,
    hasMoreInSession,
    onIndexChange: vi.fn(),
  });
}

beforeEach(() => {
  cleanup();
  gallery.mockReset();
  gallery.mockImplementation(localOnlyGallery());
});

describe('ImageAttachments', () => {
  it('renders one thumbnail per attached image', () => {
    render(<ImageAttachments images={IMAGES} />);

    expect(screen.getAllByAltText(/^Image \d+$/)).toHaveLength(3);
  });

  it('opens the viewer on the thumbnail that was clicked, not the first one', () => {
    // The component used to hold the clicked src, which cannot say what comes
    // next; this is the behaviour that regressed if it goes back to a src.
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 3'));

    expect(screen.getByAltText('Full size').getAttribute('src')).toBe(
      'data:image/png;base64,CCC',
    );
  });

  it('lets the arrow keys reach the other images in the same message', () => {
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 1'));
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    expect(screen.getByAltText('Full size').getAttribute('src')).toBe(
      'data:image/png;base64,BBB',
    );
  });

  it('shows no viewer until a thumbnail is clicked', () => {
    render(<ImageAttachments images={IMAGES} />);

    expect(screen.queryByAltText('Full size')).toBeNull();
  });

  it('closes the viewer and returns to the thumbnails', () => {
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 2'));
    expect(screen.getByAltText('Full size')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByAltText('Full size')).toBeNull();
    expect(screen.getAllByAltText(/^Image \d+$/)).toHaveLength(3);
  });

  it('offers the rest of the session, by number, when images are out of reach', () => {
    // Naming the count is the point: "there is more" persuades far less than
    // "there are 24 more".
    gallery.mockImplementation(localOnlyGallery(24));
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 1'));

    expect(screen.getByText('24 more in this session')).toBeInTheDocument();
    expect(screen.getByText('Learn more')).toBeInTheDocument();
  });

  it('shows nothing at the edge when this message already holds every image', () => {
    gallery.mockImplementation(localOnlyGallery(0, false));
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 1'));

    expect(screen.queryByText(/more in this session/)).toBeNull();
    expect(screen.queryByText('View this session’s assets')).toBeNull();
  });

  it('offers the Assets screen to a sponsor too, who has nothing locked', () => {
    // Otherwise the only route to that screen is a dock icon that ships hidden,
    // so someone can pay for the feature and never find it.
    gallery.mockImplementation(localOnlyGallery(0, true));
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 1'));

    expect(screen.getByText('View this session’s assets')).toBeInTheDocument();
    expect(screen.queryByText(/more in this session/)).toBeNull();
    expect(screen.queryByText('Learn more')).toBeNull();
  });

  it('points at where the images ARE visible, not only at what is locked', () => {
    gallery.mockImplementation(localOnlyGallery(24));
    render(<ImageAttachments images={IMAGES} />);

    fireEvent.click(screen.getByAltText('Image 1'));

    expect(screen.getByText('24 more in this session')).toBeInTheDocument();
    expect(screen.getByText('View this session’s assets')).toBeInTheDocument();
  });

  it('closes the viewer when handing over to the Assets screen', () => {
    // The viewer sits above that screen, so leaving it up would hide the very
    // thing the user just asked for.
    gallery.mockImplementation(localOnlyGallery(0, true));
    render(<ImageAttachments images={IMAGES} />);
    fireEvent.click(screen.getByAltText('Image 1'));

    fireEvent.click(screen.getByText('View this session’s assets'));

    expect(screen.queryByAltText('Full size')).toBeNull();
  });

  it('passes the entry uuid through so the gallery can locate this message', () => {
    render(<ImageAttachments images={IMAGES} entryUuid="entry-1" />);

    expect(gallery).toHaveBeenCalledWith(expect.objectContaining({ entryUuid: 'entry-1' }));
  });
});
