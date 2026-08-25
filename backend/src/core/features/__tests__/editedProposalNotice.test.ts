/**
 * The notice that tells Claude its proposal was corrected.
 *
 * Its size matters as much as its contents: it rides in every edited review, so
 * a notice that restates unchanged lines costs tokens on every one of them.
 */
import { describe, it, expect } from 'vitest';
import { buildEditedProposalNotice } from '../editedProposalNotice';

// A proposal long enough that quoting it whole would be obvious, with the
// corrections far apart — the shape that exposed the bug in a real review.
const proposed = [
  "const FREE_EXPRESS_THRESHOLD = 20000;",
  "const BULK_ITEM_COUNT = 10;",
  "",
  "export function subtotal(items) {",
  "  let total = 0;",
  "  for (const item of items) {",
  "    total += item.price * item.quantity;",
  "  }",
  "  return total;",
  "}",
  "",
  "export function shippingFor(items) {",
  "  const base = subtotal(items);",
  "  return base;",
  "}",
].join('\n');

const applied = proposed
  .replace('20000', '15000')
  .replace('  return base;', '  return base > 0 ? base : 0;');

describe('buildEditedProposalNotice', () => {
  it('says nothing when there is nothing to correct', () => {
    expect(buildEditedProposalNotice(null)).toBeNull();
    expect(buildEditedProposalNotice({ oldText: 'same', newText: 'same' })).toBeNull();
  });

  it('quotes the corrected lines', () => {
    const notice = buildEditedProposalNotice({ oldText: proposed, newText: applied })!;
    expect(notice).toContain('-const FREE_EXPRESS_THRESHOLD = 20000;');
    expect(notice).toContain('+const FREE_EXPRESS_THRESHOLD = 15000;');
    expect(notice).toContain('+  return base > 0 ? base : 0;');
  });

  it('does not restate lines the reviewer left alone', () => {
    // The bug this guards: both versions were quoted in full, so correcting two
    // lines of a 15-line proposal listed the other 13 twice.
    const notice = buildEditedProposalNotice({ oldText: proposed, newText: applied })!;
    const body = notice.split('```diff')[1].split('```')[0];
    const untouched = body
      .split('\n')
      .filter((line) => line.includes('total += item.price'));
    // It may appear once as context, never twice as a removal and an addition.
    expect(untouched.length).toBeLessThanOrEqual(1);
  });

  it('stays far smaller than quoting the proposal twice', () => {
    // Measured on the QUOTED CHANGE, not the whole notice. The instructions
    // around it are a fixed cost that does not grow with the file, and folding
    // them into this budget would make a two-line correction to a short file
    // look like a regression in how much the diff quotes.
    const notice = buildEditedProposalNotice({ oldText: proposed, newText: applied })!;
    const quoted = notice.split('```diff')[1].split('```')[0];
    expect(quoted.length).toBeLessThan(proposed.length * 2);
  });

  it('is wrapped so the chat never shows it', () => {
    const notice = buildEditedProposalNotice({ oldText: 'a\n', newText: 'b\n' })!;
    expect(notice.startsWith('<system-reminder>')).toBe(true);
    expect(notice.trimEnd().endsWith('</system-reminder>')).toBe(true);
  });

  it('asks for silence about the notice itself', () => {
    const notice = buildEditedProposalNotice({ oldText: 'a\n', newText: 'b\n' })!;
    expect(notice).toContain('Do not explain or ask about this notice.');
  });

  it('tells the assistant to revisit what it said before the edit', () => {
    // Acknowledging is not enough: the reply that came BEFORE this notice may
    // describe a change that was never applied, so the assistant is sent back
    // to read what actually landed rather than moving on.
    const notice = buildEditedProposalNotice({ oldText: 'a\n', newText: 'b\n' })!;
    expect(notice).toContain('may not match');
    expect(notice).toContain('review the actual edits');
  });

  it('asks for that acknowledgement in the user\'s own language', () => {
    // A fixed English sentence answered a Korean user in English. The reply is
    // the user's to read, so it follows their language, not the notice's.
    const notice = buildEditedProposalNotice({ oldText: 'a\n', newText: 'b\n' })!;
    expect(notice).toContain("THE USER'S OWN LANGUAGE");
  });

  it('still says something when the whole file was replaced', () => {
    // Nothing in common: the differ has no context to keep, and the notice
    // must not come back empty.
    const notice = buildEditedProposalNotice({ oldText: 'one\n', newText: 'two\n' })!;
    expect(notice).toContain('one');
    expect(notice).toContain('two');
  });
});
