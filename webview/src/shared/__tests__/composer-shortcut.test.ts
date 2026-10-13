import { describe, it, expect } from 'vitest';
import { FollowUpBehavior, resolveFollowUpBehavior } from '../composer-shortcut';

/**
 * What a message typed while a turn is running does, for someone who has never
 * opened the setting (#547).
 *
 * The terminal CLI hands a mid-turn message to the running turn at once, and
 * that is the behavior everyone had before the follow-up setting offered a
 * choice. A user who never chose must keep getting it; only an explicit "queue"
 * holds the message back.
 */
describe('resolveFollowUpBehavior', () => {
  it('hands a mid-turn message over at once when the user never chose', () => {
    expect(resolveFollowUpBehavior({})).toBe(FollowUpBehavior.Steer);
    expect(resolveFollowUpBehavior({ composerFollowUpBehavior: null })).toBe(FollowUpBehavior.Steer);
  });

  it('treats a value it does not recognise as never having chosen', () => {
    expect(resolveFollowUpBehavior({ composerFollowUpBehavior: 'interrupt' })).toBe(FollowUpBehavior.Steer);
  });

  it('holds the message back only when the user chose queue', () => {
    expect(resolveFollowUpBehavior({ composerFollowUpBehavior: FollowUpBehavior.Queue })).toBe(FollowUpBehavior.Queue);
  });

  it('keeps an explicit steer', () => {
    expect(resolveFollowUpBehavior({ composerFollowUpBehavior: FollowUpBehavior.Steer })).toBe(FollowUpBehavior.Steer);
  });
});
