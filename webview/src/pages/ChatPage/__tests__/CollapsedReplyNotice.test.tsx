import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsedReplyNotice } from '../CollapsedReplyNotice';
import { i18n } from '@/i18n';

/**
 * The band that stands in for a collapsed reply.
 *
 * What is worth asserting here is narrow. Restating the class list would be
 * copying the component into its own test, and jsdom computes no layout, so the
 * band's width cannot be measured. So these cover the two things that would
 * actually be broken by a change: the label comes from the catalogue rather than
 * being hardcoded, and pressing the band is what brings the reply back.
 *
 * Deliberately NOT asserted: that the band spans the column. jsdom computes no
 * layout, so the only thing available is the class list — and asserting that is
 * copying the implementation, which fails on a rewrite that keeps the intent
 * (`w-full` for `flex-1`) and passes on one that loses it. That property is
 * visual, and it is checked in the browser.
 */
describe('CollapsedReplyNotice', () => {
  const label = i18n.t('sendActions.collapsedReply', { ns: 'chat' });

  it('has a label to show', () => {
    // i18next returns the key itself on a miss, which would make every
    // assertion below match a button that says "sendActions.collapsedReply".
    expect(label).toBeTruthy();
    expect(label).not.toContain('sendActions.');
  });

  it('labels itself from the translation catalogue', () => {
    render(<CollapsedReplyNotice onExpand={vi.fn()} />);

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
  });

  it('expands the reply when pressed', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(<CollapsedReplyNotice onExpand={onExpand} />);

    await user.click(screen.getByRole('button', { name: label }));

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('puts the whole band inside the button, so the click target is the band', () => {
    // The label sits in the button rather than beside it. This is structure,
    // not styling: if a later change lifts the text out into a sibling, the
    // band still looks the same but only part of it responds to a click.
    render(<CollapsedReplyNotice onExpand={vi.fn()} />);

    const button = screen.getByRole('button', { name: label });
    expect(button.textContent).toContain(label);
  });
});
