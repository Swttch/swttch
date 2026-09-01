import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CollapsedReplyNotice } from '../CollapsedReplyNotice';
import { i18n } from '@/i18n';

/**
 * The line that stands in for a collapsed reply.
 *
 * What is worth asserting here is narrow. Restating the class list would be
 * copying the component into its own test, and jsdom computes no layout, so
 * nothing about how it sits on the page can be measured. So these cover what a
 * change would actually break: the label comes from the catalogue rather than
 * being hardcoded, it reports the bullets the folded body still holds, and
 * pressing it brings the reply back.
 *
 * Deliberately NOT asserted: anything visual — where the line sits, that it is
 * aligned to the start edge, that it carries no chevron. The only handle jsdom
 * offers for those is the class list, and asserting that is copying the
 * implementation: it fails on a rewrite that keeps the intent and passes on one
 * that loses it. Those properties are checked in the browser.
 */
describe('CollapsedReplyNotice', () => {
  const label = i18n.t('sendActions.collapsedReply', { ns: 'chat' });
  const counted = (count: number) => i18n.t('sendActions.collapsedReplyCount', { ns: 'chat', count });

  /**
   * The shape `ChatMessageArea` puts around a folded section: the body stays in
   * the document with `display: none`, and the notice sits beside it. The hook
   * reads the count straight out of that, so the harness has to be real markup
   * rather than a prop.
   */
  const foldedSection = (body: React.ReactNode, onExpand = vi.fn()) => (
    <div data-send-section="s1">
      <div data-section-body style={{ display: 'none' }}>{body}</div>
      <CollapsedReplyNotice sectionKey="s1" onExpand={onExpand} />
    </div>
  );

  const bullets = (n: number) =>
    Array.from({ length: n }, (_, i) => <span key={i} data-message-bullet>●</span>);

  it('has a label to show', () => {
    // i18next returns the key itself on a miss, which would make every
    // assertion below match a button that says "sendActions.collapsedReply".
    expect(label).toBeTruthy();
    expect(label).not.toContain('sendActions.');
  });

  it('has a counted label that is a different string carrying the number', () => {
    // Guards the tests below the same way. A missing plural key resolves to the
    // key itself, which carries no number — so the number has to be looked for
    // rather than just a difference from `label`.
    expect(counted(11)).not.toContain('sendActions.');
    expect(counted(11)).toContain('11');
    expect(counted(11)).not.toBe(label);
  });

  it('reports the bullets the folded body still holds', () => {
    render(foldedSection(bullets(11)));

    expect(screen.getByRole('button', { name: counted(11) })).toBeInTheDocument();
  });

  it('follows a reply that keeps streaming while folded', () => {
    // The reason folding hides the body instead of unmounting it. A section can
    // be folded while its reply is still being written, and the number has to
    // move with it rather than freeze at what was there when it was folded.
    const { rerender } = render(foldedSection(bullets(2)));
    expect(screen.getByRole('button', { name: counted(2) })).toBeInTheDocument();

    rerender(foldedSection(bullets(5)));

    expect(screen.getByRole('button', { name: counted(5) })).toBeInTheDocument();
  });

  it('does not count a bullet that IfVisible has hidden', () => {
    // `IfVisible` leaves a bubble that drew nothing in the tree with
    // `display: none`. A reader cannot see it, so it is not one of the messages
    // being hidden. The walk has to stop at the folded body, which carries the
    // same style itself.
    render(
      foldedSection(
        <>
          {bullets(2)}
          <div style={{ display: 'none' }}>
            <span data-message-bullet>●</span>
          </div>
        </>,
      ),
    );

    expect(screen.getByRole('button', { name: counted(2) })).toBeInTheDocument();
  });

  it('says only that the reply is collapsed when nothing drew a bullet', () => {
    // "0 replies collapsed" beside a section that plainly hid something is
    // worse than saying nothing about the size.
    render(foldedSection(<span>no bullet here</span>));

    const button = screen.getByRole('button', { name: label });
    expect(button.textContent).not.toMatch(/\d/);
  });

  it('expands the reply when pressed', async () => {
    const user = userEvent.setup();
    const onExpand = vi.fn();
    render(foldedSection(bullets(3), onExpand));

    await user.click(screen.getByRole('button', { name: counted(3) }));

    expect(onExpand).toHaveBeenCalledTimes(1);
  });

  it('puts the whole label inside the button, so the click target is the label', () => {
    // The label sits in the button rather than beside it. This is structure,
    // not styling: if a later change lifts the text out into a sibling, the
    // line still looks the same but only part of it responds to a click.
    render(foldedSection(bullets(3)));

    const button = screen.getByRole('button', { name: counted(3) });
    expect(button.textContent).toContain(counted(3));
  });
});
