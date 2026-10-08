import { describe, it, expect } from 'vitest';
import { MessageType } from '@/shared';
import { collectFolderFiles, readDroppedEntries, uploadFile, uploadFolder, UPLOAD_CHUNK_BYTES } from '../droppedFiles';

interface Sent {
  type: string;
  payload: Record<string, unknown>;
}

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** A backend that keeps what it was sent and answers like the real handler. */
function fakeBackend() {
  const sent: Sent[] = [];
  const request = async (type: string, payload: Record<string, unknown>) => {
    sent.push({ type, payload });
    return payload.last ? { path: `/saved/${payload.uploadId}/${payload.fileName}` } : {};
  };
  return { sent, request };
}

describe('uploadFile', () => {
  it('sends a small file as one last chunk and returns the saved path', async () => {
    const { sent, request } = fakeBackend();
    const path = await uploadFile(new File(['hello'], '화면 기록.mov'), request);

    expect(sent).toHaveLength(1);
    expect(sent[0].type).toBe(MessageType.UPLOAD_FILE_CHUNK);
    expect(sent[0].payload).toMatchObject({ fileName: '화면 기록.mov', offset: 0, last: true });
    expect(new TextDecoder().decode(decodeBase64(sent[0].payload.base64 as string))).toBe('hello');
    expect(path).toBe(`/saved/${sent[0].payload.uploadId}/화면 기록.mov`);
  });

  it('splits a larger file into ordered chunks that put the bytes back together', async () => {
    const { sent, request } = fakeBackend();
    const bytes = new Uint8Array(UPLOAD_CHUNK_BYTES * 2 + 10).map((_, i) => i % 251);
    await uploadFile(new File([bytes], 'big.bin'), request);

    expect(sent.map((s) => s.payload.offset)).toEqual([0, UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_BYTES * 2]);
    expect(sent.map((s) => s.payload.last)).toEqual([false, false, true]);
    expect(new Set(sent.map((s) => s.payload.uploadId)).size).toBe(1);
    const joined = sent.flatMap((s) => Array.from(decodeBase64(s.payload.base64 as string)));
    expect(joined).toEqual(Array.from(bytes));
  });

  it('sends an empty file as a single empty chunk', async () => {
    const { sent, request } = fakeBackend();
    await uploadFile(new File([], 'empty.txt'), request);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ offset: 0, base64: '', last: true });
  });

  it('stops at the first chunk the backend refuses', async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return { status: 'error', error: 'disk full' };
    };
    await expect(uploadFile(new File([new Uint8Array(UPLOAD_CHUNK_BYTES + 1)], 'a.bin'), request)).rejects.toThrow('disk full');
    expect(calls).toBe(1);
  });

  it('fails when the last chunk comes back without a saved path', async () => {
    await expect(uploadFile(new File(['x'], 'a.txt'), async () => ({}))).rejects.toThrow();
  });
});

describe('readDroppedEntries', () => {
  it('tells a dropped folder from a dropped file', () => {
    const file = new File(['x'], 'a.mov');
    const folder = new File([], 'some-folder');
    const listing = { isDirectory: true, name: 'some-folder' };
    const dataTransfer = {
      items: [
        { kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => ({ isDirectory: false }) },
        { kind: 'file', getAsFile: () => folder, webkitGetAsEntry: () => listing },
        { kind: 'string', getAsFile: () => null },
      ],
      files: [file, folder],
    } as unknown as DataTransfer;

    expect(readDroppedEntries(dataTransfer)).toEqual([
      { file, isDirectory: false, directory: null },
      { file: folder, isDirectory: true, directory: listing },
    ]);
  });

  it('falls back to the file list when the engine exposes no items', () => {
    const file = new File(['x'], 'a.mov');
    const dataTransfer = { items: [], files: [file] } as unknown as DataTransfer;
    expect(readDroppedEntries(dataTransfer)).toEqual([{ file, isDirectory: false, directory: null }]);
  });
});

/** A folder listing the way the browser hands it out: files and subfolders, read in batches. */
function fakeDirectory(name: string, children: Array<FileSystemEntry>, batchSize = 2): FileSystemDirectoryEntry {
  return {
    isDirectory: true,
    isFile: false,
    name,
    createReader: () => {
      let next = 0;
      return {
        readEntries: (ok: (batch: FileSystemEntry[]) => void) => {
          const batch = children.slice(next, next + batchSize);
          next += batchSize;
          ok(batch);
        },
      };
    },
  } as unknown as FileSystemDirectoryEntry;
}

function fakeFile(name: string, body = 'x'): FileSystemFileEntry {
  return {
    isDirectory: false,
    isFile: true,
    name,
    file: (ok: (file: File) => void) => ok(new File([body], name)),
  } as unknown as FileSystemFileEntry;
}

describe('collectFolderFiles', () => {
  it('walks every level and keeps where each file sat below the folder', async () => {
    const folder = fakeDirectory('photos', [
      fakeFile('a.png'),
      fakeDirectory('2026', [fakeFile('b.png'), fakeDirectory('trip', [fakeFile('c.png')])]),
      fakeFile('d.png'),
    ]);

    const found = await collectFolderFiles(folder);

    expect(found.map((f) => f.relativePath).sort()).toEqual([
      'photos/2026/b.png',
      'photos/2026/trip/c.png',
      'photos/a.png',
      'photos/d.png',
    ]);
  });

  it('keeps reading until the browser reports an empty batch, since it lists in pieces', async () => {
    const names = Array.from({ length: 7 }, (_, i) => `f${i}.txt`);
    const found = await collectFolderFiles(fakeDirectory('many', names.map((n) => fakeFile(n)), 3));
    expect(found).toHaveLength(7);
  });

  it('finds nothing in an empty folder', async () => {
    expect(await collectFolderFiles(fakeDirectory('empty', []))).toEqual([]);
  });
});

describe('uploadFolder', () => {
  it('sends every file under one upload and returns the folder root the backend names', async () => {
    const sent: Array<Record<string, unknown>> = [];
    const request = async (_type: string, payload: Record<string, unknown>) => {
      sent.push(payload);
      return payload.last ? { path: `/saved/${payload.relativePath}`, rootPath: '/saved/photos' } : {};
    };
    const files = [
      { file: new File(['1'], 'a.png'), relativePath: 'photos/a.png' },
      { file: new File(['2'], 'b.png'), relativePath: 'photos/2026/b.png' },
    ];

    const root = await uploadFolder(files, request);

    expect(root).toBe('/saved/photos');
    expect(sent.map((s) => s.relativePath)).toEqual(['photos/a.png', 'photos/2026/b.png']);
    expect(new Set(sent.map((s) => s.uploadId)).size).toBe(1);
  });

  it('refuses a folder with no files, which would leave a chip pointing at nothing', async () => {
    await expect(uploadFolder([], async () => ({}))).rejects.toThrow();
  });

  it('stops at the first file the backend refuses', async () => {
    let calls = 0;
    const request = async () => {
      calls += 1;
      return { status: 'error', error: 'disk full' };
    };
    const files = [
      { file: new File(['1'], 'a.png'), relativePath: 'p/a.png' },
      { file: new File(['2'], 'b.png'), relativePath: 'p/b.png' },
    ];
    await expect(uploadFolder(files, request)).rejects.toThrow('disk full');
    expect(calls).toBe(1);
  });
});
