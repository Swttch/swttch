import { describe, it, expect, vi, beforeEach } from 'vitest';

const loadActiveChain = vi.fn();
vi.mock('../loadSessionMessages', () => ({
  loadActiveChain: (...args: unknown[]) => loadActiveChain(...args),
}));

const { collectSessionOutputs, readSessionOutputImage } = await import('../collectSessionOutputs');

const B64 = 'AAAA';
const png = () => ({ type: 'image', source: { type: 'base64', data: B64, media_type: 'image/png' } });

const call = (uuid: string, id: string, name: string, input: object = {}) => ({
  type: 'assistant',
  uuid,
  message: { content: [{ type: 'tool_use', id, name, input }] },
});
const result = (uuid: string, id: string, content: unknown, extra: object = {}, is_error = false, timestamp = '2026-10-26T00:00:00.000Z') => ({
  type: 'user',
  uuid,
  timestamp,
  message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] },
  ...extra,
});

beforeEach(() => loadActiveChain.mockReset());

describe('collectSessionOutputs', () => {
  it('lists a picture a Read returned with its coordinate and the tool that made it', async () => {
    loadActiveChain.mockResolvedValue([call('a1', 't1', 'Read'), result('u1', 't1', [png()])]);
    const [only] = await collectSessionOutputs('/w', 's');
    expect(only).toMatchObject({ kind: 'image', entryUuid: 'u1', blockIndex: 0, partIndex: 0, tool: 'Read', mediaType: 'image/png', byteSize: 3 });
  });

  it('lists the files SendUserFile sent, in the order of the call', async () => {
    loadActiveChain.mockResolvedValue([
      call('a1', 't2', 'SendUserFile', { files: ['/a/x.pdf', '/a/y.png'] }),
      result('u2', 't2', 'ok', { toolUseResult: { attachments: [{ path: '/a/x.pdf', size: 800, isImage: false }, { path: '/a/y.png', size: 5, isImage: true }] } }),
    ]);
    const rows = await collectSessionOutputs('/w', 's');
    expect(rows.map((r) => r.kind === 'file' && [r.name, r.isImage, r.attachmentIndex])).toEqual([
      ['x.pdf', false, 0],
      ['y.png', true, 1],
    ]);
  });

  it('lists a published Artifact once, keeps its first title, and skips an update-less list call', async () => {
    const url = 'https://claude.ai/artifact/abc123';
    loadActiveChain.mockResolvedValue([
      call('a1', 't3', 'Artifact', { title: 'Deck' }),
      result('u3', 't3', `Created a new Artifact at ${url} (version v1)`),
      call('a2', 't4', 'Artifact', { file_path: '/a/deck.html' }),
      result('u4', 't4', `Published /a/deck.html at ${url} (Version 2, version id 2)`),
      call('a3', 't5', 'Artifact', { action: 'list' }),
      result('u5', 't5', `Showing 1: ${url}`),
    ]);
    const rows = await collectSessionOutputs('/w', 's');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'artifact', url, title: 'deck', entryUuid: 'u4' });
  });

  it('skips a failed call and a result with no matching call', async () => {
    loadActiveChain.mockResolvedValue([call('a1', 't6', 'Read'), result('u6', 't6', [png()], {}, true), result('u7', 'unknown', [png()])]);
    expect(await collectSessionOutputs('/w', 's')).toEqual([]);
  });
});

describe('readSessionOutputImage', () => {
  it('returns the image block source unedited, and null once it is gone', async () => {
    loadActiveChain.mockResolvedValue([call('a1', 't1', 'Read'), result('u1', 't1', [{ type: 'text', text: 'x' }, png()])]);
    expect(await readSessionOutputImage('/w', 's', { entryUuid: 'u1', blockIndex: 0, partIndex: 1 })).toEqual(png().source);
    expect(await readSessionOutputImage('/w', 's', { entryUuid: 'u1', blockIndex: 0, partIndex: 0 })).toBeNull();
    expect(await readSessionOutputImage('/w', 's', { entryUuid: 'nope', blockIndex: 0, partIndex: 1 })).toBeNull();
  });
});
