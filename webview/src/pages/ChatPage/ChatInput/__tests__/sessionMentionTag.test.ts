import { describe, it, expect } from 'vitest';
import {
  buildSessionMentionTag,
  dropSessionMentions,
  stripSessionMentionTags,
  wrapChipForTranscript,
} from '../sessionMentionTag';
import { toTitle, NO_TITLE } from '@/mappers/sessionTransformer';
import { tokenizeMessagePaths } from '../../message-renderers/utils/tokenizeMessagePaths';

const MENTION = {
  sessionId: '458fa4b4-a049',
  agentName: 'proj-57',
  sessionDir: '/Users/me/proj',
};
const CHIP = '@@fix the proxy';

/**
 * The tag is what lets a chip survive the send.
 *
 * Before it, the bubble had only characters to go on, and `@@` plus a title with
 * spaces in it cannot say where it ends — so the path tokenizer took `@@fix` and
 * offered to open a file named `@fix`. A closing tag says where it ends.
 */
describe('session mention tag', () => {
  it('carries the id and the name beside the display text', () => {
    const tag = buildSessionMentionTag({ ...MENTION, label: CHIP });

    expect(tag).toContain('session-id="458fa4b4-a049"');
    expect(tag).toContain('agent-name="proj-57"');
    expect(tag).toContain('session-dir="/Users/me/proj"');
    expect(tag).toContain(`>${CHIP}<`);
  });

  it('wraps only the chip, leaving the rest of the message alone', () => {
    const wrapped = wrapChipForTranscript(`${CHIP} hello there`, CHIP, MENTION);

    expect(stripSessionMentionTags(wrapped)).toBe(`${CHIP} hello there`);
    expect(wrapped).toContain('</session-mention> hello there');
  });

  it('leaves a message with no chip untouched', () => {
    expect(wrapChipForTranscript('just words', CHIP, MENTION)).toBe('just words');
  });

  it('escapes a quote in an attribute rather than closing it early', () => {
    const tag = buildSessionMentionTag({
      sessionId: 'a"b',
      agentName: 'c&d',
      sessionDir: '/p',
      label: CHIP,
    });

    expect(tag).toContain('session-id="a&quot;b"');
    expect(tag).toContain('agent-name="c&amp;d"');
  });

  it('gives the clipboard the words, not the markup', () => {
    const wrapped = wrapChipForTranscript(`${CHIP} hello`, CHIP, MENTION);

    expect(stripSessionMentionTags(wrapped)).toBe(`${CHIP} hello`);
  });
});

/**
 * The whole point: the bubble recovers the chip's extent from the text alone,
 * which is all it has after a reload.
 */
describe('the bubble reads the tag back', () => {
  it('makes the WHOLE chip one segment, spaces and all', () => {
    const wrapped = wrapChipForTranscript(`${CHIP} hello`, CHIP, MENTION);
    const segments = tokenizeMessagePaths(wrapped);

    const mentions = segments.filter((s) => s.mention);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].text).toBe(CHIP);
    expect(mentions[0].mention).toEqual({ ...MENTION, label: CHIP });
  });

  it('does not offer the chip as a file to open', () => {
    const wrapped = wrapChipForTranscript(`${CHIP} hello`, CHIP, MENTION);

    expect(tokenizeMessagePaths(wrapped).some((s) => s.isPath)).toBe(false);
  });

  it('still finds a real file mention beside it', () => {
    const wrapped = wrapChipForTranscript(`${CHIP} look at @src/App.tsx`, CHIP, MENTION);
    const segments = tokenizeMessagePaths(wrapped);

    expect(segments.filter((s) => s.isPath).map((s) => s.text)).toEqual(['@src/App.tsx']);
    expect(segments.filter((s) => s.mention)).toHaveLength(1);
  });

  it('loses no text', () => {
    const wrapped = wrapChipForTranscript(`hey ${CHIP} hello`, CHIP, MENTION);
    const joined = tokenizeMessagePaths(wrapped).map((s) => s.text).join('');

    expect(joined).toBe(`hey ${CHIP} hello`);
  });

  it('keeps two mentions separate rather than swallowing the middle', () => {
    const text =
      `${buildSessionMentionTag({ ...MENTION, label: '@@one' })} and ` +
      `${buildSessionMentionTag({ ...MENTION, label: '@@two' })}`;

    expect(tokenizeMessagePaths(text).filter((s) => s.mention).map((s) => s.text))
      .toEqual(['@@one', '@@two']);
  });
});

/**
 * The chip has to survive a message written before `session-dir` existed, and a
 * mention that points at another project has to open against THAT project.
 */
describe('session-dir', () => {
  it('carries the project the session belongs to', () => {
    const wrapped = wrapChipForTranscript(CHIP, CHIP, MENTION);
    const [segment] = tokenizeMessagePaths(wrapped).filter((s) => s.mention);

    expect(segment.mention?.sessionDir).toBe('/Users/me/proj');
  });

  it('still reads a message written before the attribute existed', () => {
    // Exactly what buildSessionMentionTag produced one version ago.
    const old =
      '<session-mention session-id="458fa4b4-a049" agent-name="proj-57">@@fix the proxy</session-mention> hi';
    const [segment] = tokenizeMessagePaths(old).filter((s) => s.mention);

    expect(segment.mention).toEqual({
      sessionId: '458fa4b4-a049',
      agentName: 'proj-57',
      sessionDir: '',
      label: '@@fix the proxy',
    });
  });

  it('still gives the clipboard the words when the attribute is absent', () => {
    const old =
      '<session-mention session-id="a" agent-name="b">@@fix the proxy</session-mention> hi';

    expect(stripSessionMentionTags(old)).toBe('@@fix the proxy hi');
  });
});

/**
 * A conversation that opened by addressing another one still has to be named
 * after what it is about.
 *
 * Measured in the sandbox: the tag runs to about a hundred characters of id,
 * name and path, so all fifty characters of the title were spent inside the
 * markup. The IDE tab, the dropdown toggle and every dropdown row read
 * `<session-mention session-id="458fa4b4-a049-48…`.
 */
describe('naming a conversation that opens with a mention', () => {  /** The same mention with its display label, which the tag builder needs. */
  const NAMED = { ...MENTION, label: CHIP };

  const FIRST_PROMPT =
    `${buildSessionMentionTag(NAMED)} 샌드박스에서 보내는 메세지임.\n` +
    '<system-reminder>Deliver it verbatim with the SendMessage tool.</system-reminder>';

  it('names it after the message, not after the address', () => {
    expect(toTitle(FIRST_PROMPT)).toBe('샌드박스에서 보내는 메세지임.');
  });

  it('never leaks the markup into the title', () => {
    const title = toTitle(FIRST_PROMPT);

    expect(title).not.toContain('<session-mention');
    expect(title).not.toContain('session-id=');
    expect(title).not.toContain('<system-reminder');
  });

  it('drops the whole mention, label included', () => {
    expect(dropSessionMentions(`${buildSessionMentionTag(NAMED)} hello`)).toBe('hello');
  });

  it('still cuts a long title at fifty characters', () => {
    const long = 'x'.repeat(80);

    expect(toTitle(`${buildSessionMentionTag(NAMED)} ${long}`)).toHaveLength(50);
  });

  it('falls back to the placeholder when the message was only a mention', () => {
    expect(toTitle(buildSessionMentionTag(NAMED))).toBe(NO_TITLE);
  });

  it('leaves an ordinary first prompt alone', () => {
    expect(toTitle('그냥 평범한 첫 프롬프트')).toBe('그냥 평범한 첫 프롬프트');
  });
});
