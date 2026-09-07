import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copyImage, downloadImage, openImageInNewTab } from '../imageActions';

const PNG = 'data:image/png;base64,AAAA';

let createdObjectUrls: Blob[];
let revoked: string[];

beforeEach(() => {
  createdObjectUrls = [];
  revoked = [];
  vi.useFakeTimers();

  // jsdom implements neither of these.
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    blob: async () => new Blob(['bytes'], { type: url.slice(5).split(';')[0] }),
  })));
  URL.createObjectURL = vi.fn((blob: Blob) => {
    createdObjectUrls.push(blob);
    return `blob:mock/${createdObjectUrls.length}`;
  });
  URL.revokeObjectURL = vi.fn((url: string) => revoked.push(url));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('downloadImage', () => {
  it('saves through a blob URL, not the data URL', async () => {
    // Browsers cap how long a downloadable `data:` href may be, and a screenshot
    // is easily past it — the download then fails silently.
    const clicked: string[] = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      clicked.push(this.href);
    };

    await downloadImage(PNG, 0);

    expect(clicked).toHaveLength(1);
    expect(clicked[0]).toContain('blob:');
    expect(clicked[0]).not.toContain('data:');
    HTMLAnchorElement.prototype.click = realClick;
  });

  it('names the file by position, since the original name was never recorded', async () => {
    let name = '';
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      name = this.download;
    };

    await downloadImage('data:image/webp;base64,AAAA', 4);

    expect(name).toBe('image-5.webp');
    HTMLAnchorElement.prototype.click = realClick;
  });

  it('leaves no anchor behind in the document', async () => {
    const before = document.querySelectorAll('a').length;

    await downloadImage(PNG, 0);

    expect(document.querySelectorAll('a').length).toBe(before);
  });

  it('releases the object URL later, not while the save is still reading it', async () => {
    await downloadImage(PNG, 0);

    expect(revoked).toHaveLength(0);
    vi.advanceTimersByTime(60_000);
    expect(revoked).toHaveLength(1);
  });
});

describe('copyImage', () => {
  it('rejects where the platform has no clipboard image support', async () => {
    // Saying "copied" while nothing happened is worse than saying it failed.
    vi.stubGlobal('ClipboardItem', undefined);
    Object.assign(navigator, { clipboard: {} });

    await expect(copyImage(PNG)).rejects.toThrow();
  });

  it('writes the decoded image to the clipboard when supported', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('ClipboardItem', class {
      constructor(public items: Record<string, Blob>) {}
    });
    Object.assign(navigator, { clipboard: { write } });

    await copyImage(PNG);

    expect(write).toHaveBeenCalledTimes(1);
  });
});

describe('openImageInNewTab', () => {
  it('opens a blob URL, which a data URL cannot be navigated to', async () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    await openImageInNewTab(PNG);

    expect(open).toHaveBeenCalledWith(expect.stringContaining('blob:'), '_blank', expect.any(String));
  });
});
