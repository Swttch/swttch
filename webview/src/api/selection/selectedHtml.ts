/** What the page draws around the content without being content: left out of a copy (#648). */
const IGNORED_WHEN_COPIED = '[data-streamdown="code-block-header"], [data-copy-ignore]';

/**
 * The page selection in [doc] as HTML, or undefined when nothing in the page is selected.
 *
 * The formatted counterpart of [selectedText], for a copy that has to keep what the text alone would
 * lose: bold, lists, code and tables (#648). A selection inside a text field has no formatting to keep,
 * so it gives undefined and the copy stays plain text.
 */
export function selectedHtml(doc: Document): string | undefined {
  const active = doc.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return undefined;

  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;

  const holder = doc.createElement('div');
  for (let i = 0; i < selection.rangeCount; i += 1) {
    const range = selection.getRangeAt(i);
    const fragment = range.cloneContents();
    keepEmphasis(range, fragment);
    holder.appendChild(inCodeBlock(range) ? asCodeBlock(fragment, doc) : fragment);
  }
  // What the page draws around the content and is not content: the top bar of a code block (language
  // name, copy button) and a message's own button line. The style sheet keeps them out of the
  // selected text, but the copied fragment is built from the page's elements, which still include them.
  holder.querySelectorAll(IGNORED_WHEN_COPIED).forEach((element) => element.remove());
  keepCodeLinesApart(holder);
  const html = holder.innerHTML;
  return html.length > 0 ? html : undefined;
}

const EMPHASIS_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'INS', 'S', 'DEL', 'STRIKE']);

/**
 * The page makes a word bold or slanted with a class (`font-semibold`, `italic`), and a program that
 * pastes the HTML has no stylesheet behind the class, so the emphasis is gone. The browser's own copy
 * writes what each element looks like into its `style`; this does the same for the three that carry
 * meaning in text: weight, slant and lines through or under it (#648).
 *
 * The copied fragment holds, in document order, a clone of every element of the page that the range
 * touches below its common ancestor. Each clone is matched with its original by that order. When the
 * two lists do not line up, nothing is written rather than the wrong element's look.
 */
function keepEmphasis(range: Range, fragment: DocumentFragment): void {
  const ancestor = range.commonAncestorContainer;
  const root = ancestor instanceof Element ? ancestor : ancestor.parentElement;
  if (!root) return;
  writeElementLooks(range, root, fragment);
  wrapInEmphasis(fragment, root);
}

function writeElementLooks(range: Range, root: Element, fragment: DocumentFragment): void {
  const clones = Array.from(fragment.querySelectorAll('*'));
  if (clones.length === 0) return;
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => (range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const originals: Element[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    originals.push(node as Element);
  }
  if (originals.length !== clones.length || originals.some((el, i) => el.tagName !== clones[i].tagName)) return;

  const view = root.ownerDocument.defaultView;
  if (!view) return;
  originals.forEach((original, i) => {
    // These tags already say it themselves, to any program that pastes.
    if (EMPHASIS_TAGS.has(original.tagName)) return;
    writeEmphasis(view.getComputedStyle(original), clones[i] as HTMLElement);
  });
}

/**
 * A selection inside one element is copied without that element, so what the element makes bold or
 * slanted is lost with it: a few words of a quote arrive as bare text. The browser's own copy wraps
 * such a selection in an element carrying the look; this does the same.
 */
function wrapInEmphasis(fragment: DocumentFragment, root: Element): void {
  const view = root.ownerDocument.defaultView;
  if (!view || fragment.childNodes.length === 0) return;
  const wrapper = root.ownerDocument.createElement('span');
  writeEmphasis(view.getComputedStyle(root), wrapper);
  if (!wrapper.getAttribute('style')) return;
  wrapper.appendChild(fragment);
  fragment.appendChild(wrapper);
}

function writeEmphasis(look: CSSStyleDeclaration, target: HTMLElement): void {
  if (Number.parseInt(look.fontWeight, 10) >= 600 || look.fontWeight === 'bold') target.style.fontWeight = 'bold';
  if (look.fontStyle === 'italic' || look.fontStyle === 'oblique') target.style.fontStyle = 'italic';
  const decoration = `${look.textDecorationLine} ${look.textDecoration}`;
  const lines = ['underline', 'line-through'].filter((line) => decoration.includes(line));
  if (lines.length > 0) target.style.textDecoration = lines.join(' ');
}

function inCodeBlock(range: Range): boolean {
  const ancestor = range.commonAncestorContainer;
  const element = ancestor instanceof Element ? ancestor : ancestor.parentElement;
  return element?.closest('pre') != null;
}

/**
 * A selection that starts and ends inside one code block is copied without the block around it, so
 * the lines would arrive as loose elements. Putting them back in a code block, when there are several
 * lines, lets [keepCodeLinesApart] and the program that pastes treat them as code. A part of one line
 * stays as it is: it is a word, not a block.
 */
function asCodeBlock(fragment: DocumentFragment, doc: Document): DocumentFragment {
  const lines = Array.from(fragment.children);
  if (lines.length < 2 || !lines.every((line) => line.classList.contains('block'))) return fragment;
  const pre = doc.createElement('pre');
  const code = doc.createElement('code');
  code.appendChild(fragment);
  pre.appendChild(code);
  const wrapped = doc.createDocumentFragment();
  wrapped.appendChild(pre);
  return wrapped;
}

/**
 * A code block draws each line as its own `block` element, cut into one element per token, with no
 * line break between the lines. A program that pastes the HTML has no stylesheet to make those
 * elements blocks, so it runs the lines together, and it drops a token that is only a space, so
 * `def greet` becomes `defgreet` (#648). The block is given back as its text, one line after the
 * other: what is typed stays exactly as it was, and the program colours it in its own way.
 */
function keepCodeLinesApart(holder: HTMLElement): void {
  holder.querySelectorAll('pre code').forEach((code) => {
    const lines = Array.from(code.children);
    if (lines.length < 2 || !lines.every((line) => line.classList.contains('block'))) return;
    code.textContent = lines.map((line) => line.textContent ?? '').join('\n');
  });
}
