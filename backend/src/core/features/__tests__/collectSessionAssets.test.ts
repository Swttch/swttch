import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadActiveChain = vi.fn();
vi.mock('../loadSessionMessages', () => ({
  loadActiveChain: (...args: unknown[]) => loadActiveChain(...args),
}));

const { collectSessionAssets, readSessionAsset, base64ByteLength } = await import(
  '../collectSessionAssets'
);

/** 4 base64 chars decode to 3 bytes; 'AAAA' is a convenient 3-byte payload. */
const B64 = 'AAAA';

function userEntry(uuid: string, content: unknown[], timestamp = '2026-09-06T00:00:00.000Z') {
  return { type: 'user', uuid, timestamp, message: { role: 'user', content } };
}

function imageBlock(data = B64, mediaType = 'image/png') {
  return { type: 'image', source: { type: 'base64', data, media_type: mediaType } };
}

beforeEach(() => loadActiveChain.mockReset());

describe('base64ByteLength', () => {
  it('measures without decoding, accounting for padding', () => {
    expect(base64ByteLength('AAAA')).toBe(3);
    expect(base64ByteLength('AAA=')).toBe(2);
    expect(base64ByteLength('AA==')).toBe(1);
    expect(base64ByteLength('')).toBe(0);
  });
});

describe('collectSessionAssets', () => {
  it('indexes each attached image with the coordinate needed to fetch it back', () => {
    loadActiveChain.mockResolvedValue([
      userEntry('u1', [{ type: 'text', text: 'look' }, imageBlock(), imageBlock(B64, 'image/webp')]),
    ]);

    return collectSessionAssets('/w', 's').then((assets) => {
      expect(assets).toEqual([
        { entryUuid: 'u1', blockIndex: 1, mediaType: 'image/png', timestamp: '2026-09-06T00:00:00.000Z', byteSize: 3 },
        { entryUuid: 'u1', blockIndex: 2, mediaType: 'image/webp', timestamp: '2026-09-06T00:00:00.000Z', byteSize: 3 },
      ]);
    });
  });

  it('uses the position in the content array, not the position among images', async () => {
    // blockIndex must address the raw array; counting only images would point at
    // the wrong block whenever text or a tool block precedes them.
    loadActiveChain.mockResolvedValue([
      userEntry('u1', [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }, imageBlock()]),
    ]);

    const assets = await collectSessionAssets('/w', 's');

    expect(assets).toHaveLength(1);
    expect(assets[0].blockIndex).toBe(2);
  });

  it('ignores images that came back from a tool rather than from the user', async () => {
    // A screenshot Claude read arrives nested in a tool_result. The Assets screen
    // is laid out on user messages, so counting those would break its axis.
    loadActiveChain.mockResolvedValue([
      userEntry('u1', [
        { type: 'tool_result', tool_use_id: 't1', content: [imageBlock()] },
      ]),
    ]);

    expect(await collectSessionAssets('/w', 's')).toEqual([]);
  });

  it('ignores assistant entries even when they carry image blocks', async () => {
    loadActiveChain.mockResolvedValue([
      { type: 'assistant', uuid: 'a1', message: { role: 'assistant', content: [imageBlock()] } },
    ]);

    expect(await collectSessionAssets('/w', 's')).toEqual([]);
  });

  it('skips an entry with no uuid, which could never be pointed back at', async () => {
    loadActiveChain.mockResolvedValue([
      { type: 'user', message: { role: 'user', content: [imageBlock()] } },
      userEntry('u2', [imageBlock()]),
    ]);

    const assets = await collectSessionAssets('/w', 's');

    expect(assets).toHaveLength(1);
    expect(assets[0].entryUuid).toBe('u2');
  });

  it('keeps the transcript order across entries', async () => {
    loadActiveChain.mockResolvedValue([
      userEntry('u1', [imageBlock()]),
      userEntry('u2', [imageBlock()]),
      userEntry('u3', [imageBlock()]),
    ]);

    expect((await collectSessionAssets('/w', 's')).map((a) => a.entryUuid)).toEqual(['u1', 'u2', 'u3']);
  });

  it('never carries the image bytes', async () => {
    // The whole point of the index: a heavy session holds ~20MB of base64 and
    // shipping it with the list would push all of it through the socket.
    loadActiveChain.mockResolvedValue([userEntry('u1', [imageBlock('SOMEVERYLONGPAYLOAD==')])]);

    const assets = await collectSessionAssets('/w', 's');

    expect(JSON.stringify(assets)).not.toContain('SOMEVERYLONGPAYLOAD');
    expect(assets[0]).not.toHaveProperty('data');
    expect(assets[0]).not.toHaveProperty('source');
  });

  it('tolerates entries whose content is absent or not an array', async () => {
    loadActiveChain.mockResolvedValue([
      { type: 'user', uuid: 'u1', message: { role: 'user' } },
      { type: 'user', uuid: 'u2', message: { role: 'user', content: 'plain string' } },
      { type: 'user', uuid: 'u3' },
    ]);

    expect(await collectSessionAssets('/w', 's')).toEqual([]);
  });

  it('reports an empty index for a session with no attachments', async () => {
    loadActiveChain.mockResolvedValue([userEntry('u1', [{ type: 'text', text: 'hi' }])]);

    expect(await collectSessionAssets('/w', 's')).toEqual([]);
  });
});

describe('readSessionAsset', () => {
  it('returns the block source untouched, so the webview sees what the CLI wrote', async () => {
    const block = imageBlock('PAYLOAD');
    loadActiveChain.mockResolvedValue([userEntry('u1', [{ type: 'text', text: 'x' }, block])]);

    const source = await readSessionAsset('/w', 's', { entryUuid: 'u1', blockIndex: 1 });

    expect(source).toEqual({ type: 'base64', data: 'PAYLOAD', media_type: 'image/png' });
  });

  it('answers null for an entry that is no longer in the chain', async () => {
    // A rewind can drop the entry while the viewer is open; that is "gone",
    // not a failure.
    loadActiveChain.mockResolvedValue([userEntry('u1', [imageBlock()])]);

    expect(await readSessionAsset('/w', 's', { entryUuid: 'nope', blockIndex: 0 })).toBeNull();
  });

  it('answers null when the block index does not address an attached image', async () => {
    loadActiveChain.mockResolvedValue([userEntry('u1', [{ type: 'text', text: 'x' }, imageBlock()])]);

    expect(await readSessionAsset('/w', 's', { entryUuid: 'u1', blockIndex: 0 })).toBeNull();
    expect(await readSessionAsset('/w', 's', { entryUuid: 'u1', blockIndex: 9 })).toBeNull();
  });
});
