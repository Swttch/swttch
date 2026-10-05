import { describe, it, expect } from 'vitest';
import { HostClipboard } from '../HostClipboard';

/** jsdom's File has no `.text()`, so read the bytes back the way the attachment path does. */
function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

describe('HostClipboard.from', () => {
  it('reads the text the host answered with', () => {
    const host = HostClipboard.from({ text: 'copied elsewhere', image: null });

    expect(host.text).toBe('copied elsewhere');
    expect(host.hasImage).toBe(false);
    expect(host.toImageFile()).toBeNull();
  });

  it('reads an image and turns it into a file the attachment path accepts', async () => {
    // "PNG" in base64 stands in for the bytes: only that they survive intact matters here.
    const base64 = btoa('PNG');
    const host = HostClipboard.from({ text: null, image: { mimeType: 'image/png', base64 } });

    expect(host.hasImage).toBe(true);
    const file = host.toImageFile();
    expect(file).not.toBeNull();
    if (!file) return;
    expect(file.type).toBe('image/png');
    expect(file.size).toBe(3);
    expect(file.name).toBe('image.png');
    expect(await readText(file)).toBe('PNG');
  });

  it('keeps both parts when the host found both', () => {
    const host = HostClipboard.from({ text: 'caption', image: { mimeType: 'image/png', base64: 'AAAA' } });

    expect(host.text).toBe('caption');
    expect(host.hasImage).toBe(true);
  });

  it('counts missing, null and empty parts as "not on the clipboard"', () => {
    expect(HostClipboard.from({})).toBe(HostClipboard.NONE);
    expect(HostClipboard.from({ text: '', image: null })).toBe(HostClipboard.NONE);
    expect(HostClipboard.from(null)).toBe(HostClipboard.NONE);
    expect(HostClipboard.from(undefined)).toBe(HostClipboard.NONE);
  });

  it('drops an image that lacks its type or its bytes, so no broken attachment is built', () => {
    expect(HostClipboard.from({ image: { mimeType: 'image/png' } }).hasImage).toBe(false);
    expect(HostClipboard.from({ image: { base64: 'AAAA' } }).hasImage).toBe(false);
    expect(HostClipboard.from({ image: { mimeType: '', base64: 'AAAA' } }).hasImage).toBe(false);
  });
});
