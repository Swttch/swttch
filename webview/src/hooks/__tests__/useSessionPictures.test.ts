import { describe, expect, it } from 'vitest';
import type { SessionAsset, SessionOutput } from '@/shared';
import { mergePictures } from '../useSessionPictures';

const asset = (entryUuid: string, timestamp: string | null, blockIndex = 0): SessionAsset => ({
  entryUuid, blockIndex, mediaType: 'image/png', timestamp, byteSize: 1, messagePreview: '',
});
const shot = (entryUuid: string, timestamp: string | null): SessionOutput => ({
  kind: 'image', entryUuid, blockIndex: 0, partIndex: 0, mediaType: 'image/png', byteSize: 1, timestamp, tool: 'Read',
});

describe('mergePictures', () => {
  it('interleaves what you attached and what Claude made in conversation order', () => {
    const merged = mergePictures(
      [asset('a1', '2026-10-26T01:00:00Z'), asset('a2', '2026-10-26T03:00:00Z')],
      [shot('o1', '2026-10-26T02:00:00Z'), shot('o2', '2026-10-26T04:00:00Z')],
    );
    expect(merged.map((p) => p.entryUuid)).toEqual(['a1', 'o1', 'a2', 'o2']);
    expect(merged.map((p) => p.kind)).toEqual(['asset', 'output', 'asset', 'output']);
  });

  it('keeps each list in its own order when a timestamp is missing', () => {
    const merged = mergePictures([asset('a1', null), asset('a2', '2026-10-26T01:00:00Z')], [shot('o1', null)]);
    expect(merged.map((p) => p.entryUuid)).toEqual(['a1', 'a2', 'o1']);
  });

  it('gives an attachment and an output different keys even for the same entry', () => {
    const merged = mergePictures([asset('e', '2026-10-26T01:00:00Z', 2)], [shot('e', '2026-10-26T01:00:00Z')]);
    expect(new Set(merged.map((p) => p.key)).size).toBe(2);
  });

  it('handles either list being empty', () => {
    expect(mergePictures([], [])).toEqual([]);
    expect(mergePictures([asset('a', null)], []).map((p) => p.entryUuid)).toEqual(['a']);
    expect(mergePictures([], [shot('o', null)]).map((p) => p.entryUuid)).toEqual(['o']);
  });
});
