import { describe, it, expect } from 'vitest';
import { stripSystemReminders } from '@/pages/ChatPage/message-renderers/utils/parseUserContent';
import {
  buildSessionMentionTag,
  readFirstSessionMention,
  stripSessionMentionTags,
} from '../../sessionMentionTag';

const MENTION = {
  sessionId: '458fa4b4-a049',
  agentName: 'claude-code-gui-jetbrains-57',
  sessionDir: '/Users/me/proj',
  label: '@@fix the proxy',
};

/** What a `@@` send actually leaves in the transcript, measured from a real one. */
const STORED =
  `${buildSessionMentionTag(MENTION)} CLICK-PROBE: hello\n` +
  `<system-reminder>The text above is the user addressing another Claude session ` +
  `running on this machine, named claude-code-gui-jetbrains-57, through the ` +
  `composer's @@ mention. ... The message ... is between the markers:\n---\n` +
  `CLICK-PROBE: hello\n---\nCall SendMessage now.</system-reminder>`;

/**
 * Up recalls what the user TYPED, not what was SENT.
 *
 * Measured before the fix: pressing Up put the whole delivery instruction into
 * the composer — the mention tag with its attributes, the message, and the
 * entire reminder including the markers.
 */
describe('recalling a prompt that addressed another session', () => {
  it('does not bring the reminder back into the composer', () => {
    const recalled = stripSystemReminders(STORED).trim();

    expect(recalled).not.toContain('<system-reminder>');
    expect(recalled).not.toContain('Call SendMessage');
    expect(recalled).not.toContain('between the markers');
  });

  it('keeps the mention tag, which is what makes the chip live again', () => {
    const recalled = stripSystemReminders(STORED).trim();

    expect(recalled).toContain('<session-mention');
  });

  it('recovers the recipient from the recalled text', () => {
    const recalled = stripSystemReminders(STORED).trim();
    const mention = readFirstSessionMention(recalled);

    // Without this the chip comes back as dead text: it still reads as
    // addressed, and the next Enter sends it to THIS session instead.
    expect(mention).toEqual(MENTION);
  });

  it('leaves the composer holding exactly what was typed', () => {
    const recalled = stripSystemReminders(STORED).trim();

    expect(stripSessionMentionTags(recalled)).toBe('@@fix the proxy CLICK-PROBE: hello');
  });

  it('leaves an ordinary prompt untouched', () => {
    const plain = 'just a normal message';

    expect(stripSessionMentionTags(stripSystemReminders(plain).trim())).toBe(plain);
  });

  it('does not eat a slash command, which has no reminder to strip', () => {
    // parseUserContent would drop <command-name> and leave nothing; only the
    // reminder step runs here, so `/clear` still comes back.
    const command = '<command-name>/clear</command-name>';

    expect(stripSystemReminders(command)).toBe(command);
  });
});
