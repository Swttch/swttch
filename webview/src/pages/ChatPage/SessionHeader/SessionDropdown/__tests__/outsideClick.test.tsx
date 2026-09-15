import { describe, it, expect, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { isClickOutsideDropdown } from '../index';

/**
 * What the session dropdown treats as a click outside itself (issue #449).
 *
 * Exercised through the exported predicate rather than by mounting the
 * dropdown: mounting it pulls in the session context, the bridge and the whole
 * list, none of which decides this.
 *
 * The dropdown closes on any mousedown that lands outside its own element. That
 * was the whole rule until its session list grew a filter menu, which renders
 * into `<body>` through Tippy so the list's overflow cannot clip it. Such a
 * click is outside the dropdown's element while being inside the dropdown as
 * far as the user is concerned, and closing on it shut the dropdown the moment
 * they touched a filter.
 */

/** Shorthand for the predicate under test, which is the shipped one. */
const isOutside = (dropdown: Element, target: Node) => isClickOutsideDropdown(dropdown, target);

const added: Element[] = [];

function mount(html: string): Element {
  const host = document.createElement('div');
  host.innerHTML = html;
  const el = host.firstElementChild!;
  document.body.appendChild(el);
  added.push(el);
  return el;
}

afterEach(() => {
  while (added.length) added.pop()!.remove();
});

describe('session dropdown — what counts as a click outside', () => {
  it('closes on a click elsewhere on the page', () => {
    const dropdown = mount('<div id="dropdown"><button>toggle</button></div>');
    const elsewhere = mount('<main>somewhere else</main>');

    expect(isOutside(dropdown, elsewhere)).toBe(true);
  });

  it('stays open for a click on its own contents', () => {
    const dropdown = mount('<div id="dropdown"><button id="row">a session</button></div>');

    expect(isOutside(dropdown, dropdown.querySelector('#row')!)).toBe(false);
  });

  it('stays open for a click inside a menu it opened into the body', () => {
    const dropdown = mount('<div id="dropdown"><button>filters</button></div>');
    // Shaped like what Tippy appends: the popper root carries data-tippy-root,
    // and the thing actually clicked is nested inside it.
    const popper = mount(
      '<div data-tippy-root><div role="menu"><button id="filter">Working</button></div></div>',
    );

    expect(isOutside(dropdown, popper.querySelector('#filter')!)).toBe(false);
  });

  it('still closes for a click on a menu that belongs to something else', () => {
    // Only Tippy poppers are spared, and only because this dropdown is the one
    // that opens them. An ordinary sibling element is still outside.
    const dropdown = mount('<div id="dropdown"><button>filters</button></div>');
    const other = mount('<div role="menu"><button id="item">unrelated</button></div>');

    expect(isOutside(dropdown, other.querySelector('#item')!)).toBe(true);
  });

  it('is the rule a real mousedown goes through', () => {
    // Guards the wiring as well as the predicate: a handler bound the way the
    // dropdown binds one sees the same answers.
    const dropdown = mount('<div id="dropdown"><button>filters</button></div>');
    const popper = mount('<div data-tippy-root><button id="filter">Working</button></div>');
    const closes: boolean[] = [];
    const handler = (e: MouseEvent) => closes.push(isOutside(dropdown, e.target as Node));
    document.addEventListener('mousedown', handler);

    fireEvent.mouseDown(popper.querySelector('#filter')!);
    fireEvent.mouseDown(document.body);

    document.removeEventListener('mousedown', handler);
    expect(closes).toEqual([false, true]);
  });
});
