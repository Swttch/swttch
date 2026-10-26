/**
 * A page's text as Markdown: headings, paragraphs, lists, links, emphasis, code, quotes, rules,
 * images and tables. What a page draws with scripts or styles is not carried; scripts and styles
 * themselves are dropped. The pane's "copy as Markdown" uses it, as Claude Desktop's artifact
 * menu has the same item.
 */
export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out = blocks(doc.body);
  return out.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

const SKIPPED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'TITLE']);
const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE', 'FIGURE', 'FIGCAPTION', 'FORM', 'FIELDSET', 'DETAILS', 'SUMMARY']);

function text(node: Node): string {
  return (node.textContent ?? '').replace(/\s+/g, ' ');
}

function inline(node: Node): string {
  let result = '';
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      result += text(child);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    if (SKIPPED.has(el.tagName)) return;
    const inner = inline(el);
    switch (el.tagName) {
      case 'STRONG':
      case 'B':
        result += inner.trim() ? `**${inner.trim()}**` : '';
        break;
      case 'EM':
      case 'I':
        result += inner.trim() ? `*${inner.trim()}*` : '';
        break;
      case 'CODE':
        result += inner ? `\`${inner}\`` : '';
        break;
      case 'A': {
        const href = el.getAttribute('href');
        result += href && inner.trim() ? `[${inner.trim()}](${href})` : inner;
        break;
      }
      case 'IMG': {
        const src = el.getAttribute('src');
        result += src ? `![${el.getAttribute('alt') ?? ''}](${src})` : '';
        break;
      }
      case 'BR':
        result += '  \n';
        break;
      default:
        result += inner;
    }
  });
  return result;
}

function list(el: Element, ordered: boolean, depth: number): string {
  let index = 1;
  let result = '';
  for (const item of Array.from(el.children)) {
    if (item.tagName !== 'LI') continue;
    const marker = ordered ? `${index++}. ` : '- ';
    const pad = '  '.repeat(depth);
    let own = '';
    let nested = '';
    item.childNodes.forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes((child as Element).tagName)) {
        nested += list(child as Element, (child as Element).tagName === 'OL', depth + 1);
      } else if (child.nodeType === Node.ELEMENT_NODE && SKIPPED.has((child as Element).tagName)) {
        // dropped
      } else {
        own += child.nodeType === Node.TEXT_NODE ? text(child) : inline(child.parentElement === item ? wrap(child) : item);
      }
    });
    result += `${pad}${marker}${own.trim()}\n${nested}`;
  }
  return result;
}

/** A node alone in a fragment, so `inline` can read it as a child. */
function wrap(node: Node): Node {
  const holder = document.createElement('span');
  holder.appendChild(node.cloneNode(true));
  return holder;
}

function table(el: Element): string {
  const rows = Array.from(el.querySelectorAll('tr')).map((row) =>
    Array.from(row.children).map((cell) => inline(cell).trim().replace(/\|/g, '\\|')),
  );
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '');
  const [head, ...body] = rows.map(pad);
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n') + '\n\n';
}

function blocks(parent: Node): string {
  let result = '';
  let run = '';
  const flush = () => {
    if (run.trim()) result += `${run.trim()}\n\n`;
    run = '';
  };
  parent.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      run += text(child);
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as Element;
    if (SKIPPED.has(el.tagName)) return;
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      flush();
      result += `${'#'.repeat(Number(tag[1]))} ${inline(el).trim()}\n\n`;
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      result += `${list(el, tag === 'OL', 0)}\n`;
    } else if (tag === 'PRE') {
      flush();
      result += `\`\`\`\n${(el.textContent ?? '').replace(/\n$/, '')}\n\`\`\`\n\n`;
    } else if (tag === 'BLOCKQUOTE') {
      flush();
      result += blocks(el).trim().split('\n').map((l) => `> ${l}`.trimEnd()).join('\n') + '\n\n';
    } else if (tag === 'HR') {
      flush();
      result += '---\n\n';
    } else if (tag === 'TABLE') {
      flush();
      result += table(el);
    } else if (tag === 'BR') {
      run += '  \n';
    } else if (BLOCKS.has(tag) || tag === 'BODY') {
      flush();
      const inner = blocks(el);
      result += inner;
    } else {
      run += inline(wrap(el));
    }
  });
  flush();
  return result;
}
