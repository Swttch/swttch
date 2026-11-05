import { describe, it, expect } from 'vitest';
import { formatReplyBlocks, parseReplyBlocks } from '../replyBlocks';

// The first three are the text Claude Desktop recorded in real sessions.
const ONE_REPLY = '<!-- reply 1 -->\n> 응답이 비었거나 타임아웃이면 대체한다.\n\nai-title 을 비롯한 소스가 무엇이야?\n\n\n';
const REPLY_AND_EXCERPT =
  '<!-- reply 1 -->\n> 둘 다 만들까요?\n\n아니. 한번에 보내는게 좋아.\n\n\n<!-- attach -->\n> 우리 쪽 결정';
const TWO_REPLIES_AND_BODY =
  '<!-- reply 2 -->\n> 첫 인용\n\n첫 코멘트\n\n<!-- reply -->\n> 둘째 인용\n\n둘째 코멘트\n\n\n본문 첫 줄\n\n본문 둘째 문단';

describe('parseReplyBlocks', () => {
  it('reads one reply with nothing typed after it', () => {
    expect(parseReplyBlocks(ONE_REPLY)).toEqual({
      replies: [{ quote: '응답이 비었거나 타임아웃이면 대체한다.', comment: 'ai-title 을 비롯한 소스가 무엇이야?' }],
      excerpts: [],
      body: '',
    });
  });

  it('reads a reply followed by an excerpt', () => {
    expect(parseReplyBlocks(REPLY_AND_EXCERPT)).toEqual({
      replies: [{ quote: '둘 다 만들까요?', comment: '아니. 한번에 보내는게 좋아.' }],
      excerpts: ['우리 쪽 결정'],
      body: '',
    });
  });

  it('reads several replies and the text typed after them', () => {
    expect(parseReplyBlocks(TWO_REPLIES_AND_BODY)).toEqual({
      replies: [
        { quote: '첫 인용', comment: '첫 코멘트' },
        { quote: '둘째 인용', comment: '둘째 코멘트' },
      ],
      excerpts: [],
      body: '본문 첫 줄\n\n본문 둘째 문단',
    });
  });

  it('reads an excerpt of several lines and the text after it', () => {
    expect(parseReplyBlocks('<!-- attach -->\n> 첫 줄\n> 둘째 줄\n\n본문')).toEqual({
      replies: [],
      excerpts: ['첫 줄\n둘째 줄'],
      body: '본문',
    });
  });

  it('keeps a comment of several paragraphs together', () => {
    const parsed = parseReplyBlocks('<!-- reply 1 -->\n> 인용\n\n문단 하나\n\n문단 둘\n\n\n');
    expect(parsed?.replies[0].comment).toBe('문단 하나\n\n문단 둘');
  });

  it('reads one excerpt block per excerpt card, as Desktop recorded two of them', () => {
    const recorded =
      '<!-- reply 2 -->\n> 첫 인용\n\n첫 코멘트\n\n<!-- reply -->\n> 둘째 인용\n\n둘째 코멘트\n\n\n<!-- attach -->\n> 발췌 하나\n\n<!-- attach -->\n> 발췌 둘';
    expect(parseReplyBlocks(recorded)).toEqual({
      replies: [
        { quote: '첫 인용', comment: '첫 코멘트' },
        { quote: '둘째 인용', comment: '둘째 코멘트' },
      ],
      excerpts: ['발췌 하나', '발췌 둘'],
      body: '',
    });
    expect(formatReplyBlocks(
      [
        { quote: '첫 인용', comment: '첫 코멘트' },
        { quote: '둘째 인용', comment: '둘째 코멘트' },
      ],
      ['발췌 하나', '발췌 둘'],
    )).toBe(`${recorded}\n\n`);
  });

  it('is not a card message unless the markers open the message', () => {
    expect(parseReplyBlocks('안녕\n<!-- reply 1 -->\n> a\n\nb')).toBeNull();
    expect(parseReplyBlocks('그냥 글')).toBeNull();
  });
});

describe('formatReplyBlocks', () => {
  it('writes what Desktop writes', () => {
    expect(formatReplyBlocks([{ quote: '응답이 비었거나 타임아웃이면 대체한다.', comment: 'ai-title 을 비롯한 소스가 무엇이야?' }], [])).toBe(ONE_REPLY);
    expect(formatReplyBlocks([{ quote: '둘 다 만들까요?', comment: '아니. 한번에 보내는게 좋아.' }], ['우리 쪽 결정'])).toBe(
      `${REPLY_AND_EXCERPT}\n\n`,
    );
  });

  it('numbers only the first reply', () => {
    const text = formatReplyBlocks(
      [
        { quote: '첫 인용', comment: '첫 코멘트' },
        { quote: '둘째 인용', comment: '둘째 코멘트' },
      ],
      [],
    );
    expect(text).toContain('<!-- reply 2 -->');
    expect(text.match(/<!-- reply -->/g)).toHaveLength(1);
  });

  it('gives back what it was given once typed text follows', () => {
    const replies = [
      { quote: '첫 줄\n둘째 줄', comment: '코멘트\n\n둘째 문단' },
      { quote: '인용', comment: '또' },
    ];
    const text = formatReplyBlocks(replies, ['발췌']) + '본문';
    expect(parseReplyBlocks(text)).toEqual({ replies, excerpts: ['발췌'], body: '본문' });
  });

  it('writes nothing when there are no cards', () => {
    expect(formatReplyBlocks([], [])).toBe('');
  });
});
