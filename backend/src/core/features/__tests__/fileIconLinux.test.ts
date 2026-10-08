import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { findIcon, iconNamesFor, mimeTypeFor, readLinuxIcon, type LinuxIconEnv } from '../fileIconLinux';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ccg-linux-icon-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(relative: string, content: string | Buffer): Promise<string> {
  const path = join(root, relative);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return path;
}

const env = (themes: string[] = ['Adwaita']): LinuxIconEnv => ({
  globsFiles: [join(root, 'mime', 'globs2')],
  genericIconsFiles: [join(root, 'mime', 'generic-icons')],
  iconRoots: [join(root, 'icons')],
  themes: async () => themes,
});

const GLOBS = [
  '# This file was automatically generated',
  '50:application/pdf:*.pdf',
  '50:text/markdown:*.md',
  '50:text/x-csrc:*.c',
  '30:text/x-objcsrc:*.c',
  '50:image/x-xcf:*.XCF:cs',
  '50:application/vnd.oasis.opendocument.text:*.odt',
].join('\n');

describe('mimeTypeFor', () => {
  it('finds the type an extension belongs to', async () => {
    await put('mime/globs2', GLOBS);
    expect(await mimeTypeFor('pdf', [join(root, 'mime', 'globs2')])).toBe('application/pdf');
  });

  it('takes the heaviest rule when several name the same extension', async () => {
    await put('mime/globs2', GLOBS);
    expect(await mimeTypeFor('c', [join(root, 'mime', 'globs2')])).toBe('text/x-csrc');
  });

  it('knows no type for an extension the database has not heard of', async () => {
    await put('mime/globs2', GLOBS);
    expect(await mimeTypeFor('kts', [join(root, 'mime', 'globs2')])).toBeNull();
  });

  it('skips a rule that only matches in the exact case, which a lower-cased extension never is', async () => {
    await put('mime/globs2', GLOBS);
    expect(await mimeTypeFor('xcf', [join(root, 'mime', 'globs2')])).toBeNull();
  });

  it('reads more than one database, the person\'s own beside the system\'s', async () => {
    await put('own/globs2', '60:text/x-kotlin:*.kts');
    await put('mime/globs2', GLOBS);
    expect(await mimeTypeFor('kts', [join(root, 'own', 'globs2'), join(root, 'mime', 'globs2')])).toBe('text/x-kotlin');
  });

  it('copes with a database that is not there', async () => {
    expect(await mimeTypeFor('pdf', [join(root, 'nope', 'globs2')])).toBeNull();
  });
});

describe('iconNamesFor', () => {
  it('names the icon after the type, then the database\'s generic icon, then the family', async () => {
    await put('mime/generic-icons', 'application/pdf:x-office-document\ntext/plain:text-x-generic');
    expect(await iconNamesFor('application/pdf', [join(root, 'mime', 'generic-icons')])).toEqual([
      'application-pdf',
      'x-office-document',
      'application-x-generic',
    ]);
  });

  it('does not list a name twice', async () => {
    await put('mime/generic-icons', 'text/plain:text-x-generic');
    expect(await iconNamesFor('text/plain', [join(root, 'mime', 'generic-icons')])).toEqual(['text-plain', 'text-x-generic']);
  });

  it('still has names without a generic-icons file', async () => {
    expect(await iconNamesFor('video/mp4', [join(root, 'none')])).toEqual(['video-mp4', 'video-x-generic']);
  });
});

describe('findIcon', () => {
  const roots = () => [join(root, 'icons')];

  it('finds a scalable svg and says it is one', async () => {
    await put('icons/Adwaita/scalable/mimetypes/application-pdf.svg', '<svg/>');
    expect(await findIcon(['application-pdf'], ['Adwaita'], roots())).toEqual({
      mimeType: 'image/svg+xml',
      base64: Buffer.from('<svg/>').toString('base64'),
    });
  });

  it('finds a png in either folder layout themes use', async () => {
    await put('icons/Humanity/48x48/mimetypes/application-pdf.png', 'png-a');
    await put('icons/breeze/mimetypes/64/application-pdf.png', 'png-b');

    expect((await findIcon(['application-pdf'], ['Humanity'], roots()))?.mimeType).toBe('image/png');
    expect((await findIcon(['application-pdf'], ['breeze'], roots()))?.mimeType).toBe('image/png');
  });

  it('prefers the nearest size to what a card draws', async () => {
    await put('icons/T/256x256/mimetypes/x.png', 'big');
    await put('icons/T/64x64/mimetypes/x.png', 'right');
    expect((await findIcon(['x'], ['T'], roots()))?.base64).toBe(Buffer.from('right').toString('base64'));
  });

  it('lets the specific name in a later theme beat the generic name in an earlier one', async () => {
    await put('icons/First/scalable/mimetypes/text-x-generic.svg', 'generic');
    await put('icons/Second/scalable/mimetypes/application-pdf.svg', 'pdf');

    const found = await findIcon(['application-pdf', 'text-x-generic'], ['First', 'Second'], roots());
    expect(found?.base64).toBe(Buffer.from('pdf').toString('base64'));
  });

  it('falls back to the next name when the first is in no theme', async () => {
    await put('icons/Adwaita/scalable/mimetypes/text-x-generic.svg', 'generic');
    const found = await findIcon(['application-pdf', 'text-x-generic'], ['Adwaita'], roots());
    expect(found?.base64).toBe(Buffer.from('generic').toString('base64'));
  });

  it('skips a picture too big to put in a message', async () => {
    await put('icons/Adwaita/scalable/mimetypes/x.svg', Buffer.alloc(300 * 1024));
    expect(await findIcon(['x'], ['Adwaita'], roots())).toBeNull();
  });

  it('has nothing when no theme holds the icon', async () => {
    expect(await findIcon(['application-pdf'], ['Adwaita'], roots())).toBeNull();
  });
});

describe('readLinuxIcon', () => {
  it('walks all three steps from an extension to a picture', async () => {
    await put('mime/globs2', GLOBS);
    await put('mime/generic-icons', 'application/pdf:x-office-document');
    await put('icons/Adwaita/scalable/mimetypes/application-pdf.svg', '<svg id="pdf"/>');

    expect(await readLinuxIcon('pdf', env())).toEqual({
      mimeType: 'image/svg+xml',
      base64: Buffer.from('<svg id="pdf"/>').toString('base64'),
    });
  });

  it('uses the generic icon when the theme has none for the exact type', async () => {
    await put('mime/globs2', GLOBS);
    await put('mime/generic-icons', 'application/vnd.oasis.opendocument.text:x-office-document');
    await put('icons/Adwaita/scalable/mimetypes/x-office-document.svg', '<svg id="doc"/>');

    const icon = await readLinuxIcon('odt', env());
    expect(Buffer.from(icon!.base64, 'base64').toString()).toBe('<svg id="doc"/>');
  });

  it('has nothing for an extension the database does not know, so the chip keeps its drawn icon', async () => {
    await put('mime/globs2', GLOBS);
    expect(await readLinuxIcon('kts', env())).toBeNull();
  });

  it('has nothing on a machine with no database or no theme', async () => {
    expect(await readLinuxIcon('pdf', env())).toBeNull();
  });
});
