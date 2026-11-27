import { describe, it, expect } from 'vitest';
import { sendContent } from '../sendContent';
import { formatReplyBlocks } from '../../../message-renderers/utils/replyBlocks';
import { buildSessionMentionTag } from '../../sessionMentionTag';
import type { LoadedMessageDto } from '@/types';

const message = (content: unknown, uuid = 'u1') =>
  ({ type: 'user', uuid, message: { role: 'user', content } }) as unknown as LoadedMessageDto;

function shelf() {
  const kept = new Map<string, string>();
  return { kept, picture: (id: string) => kept.get(id), keepPicture: (id: string, data: string) => void kept.set(id, data) };
}

const image = (data: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });

describe('sendContent', () => {
  it('gives back the pictures of a send as attachments, with their bytes', () => {
    const pictures = shelf();

    const content = sendContent(message([image('AAAA'), image('BBBB'), { type: 'text', text: 'look' }]), pictures);

    expect(content.text).toBe('look');
    expect(content.attachments.map((a) => [a.type, a.name, a.mimeType])).toEqual([
      ['image', 'image-1.jpeg', 'image/jpeg'],
      ['image', 'image-2.jpeg', 'image/jpeg'],
    ]);
    expect(content.attachments.map((a) => pictures.picture(a.id))).toEqual(['AAAA', 'BBBB']);
  });

  it('names the pictures of a message typed during a turn in letters a file can have', () => {
    const content = sendContent(message([image('AAAA')], 'queued-2026-11-27T10:00:00.000Z-1'), shelf());

    expect(content.attachments[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('gives back reply and excerpt cards as cards, not as their markup', () => {
    const raw = `${formatReplyBlocks([{ quote: 'quoted words', comment: 'my comment' }], ['an excerpt'])}the typed words`;

    const content = sendContent(message(raw), shelf());

    expect(content.text).toBe('the typed words');
    expect(content.replies.map(({ quote, comment }) => ({ quote, comment }))).toEqual([
      { quote: 'quoted words', comment: 'my comment' },
      { quote: 'an excerpt', comment: '' },
    ]);
    expect(content.text).not.toContain('<!--');
  });

  it('addresses a recalled @@ send again', () => {
    const tag = buildSessionMentionTag({ sessionId: 's2', agentName: 'other', sessionDir: '/p', label: '@@fix it' });

    const content = sendContent(message(`${tag} hello`), shelf());

    expect(content.recipient).toMatchObject({ sessionId: 's2', name: 'other', token: '@@fix it' });
    expect(content.text).toBe('@@fix it hello');
  });

  it('gives a send of pictures alone an empty text', () => {
    expect(sendContent(message([image('AAAA')]), shelf())).toMatchObject({ text: '', attachments: [{ type: 'image' }] });
  });
});
