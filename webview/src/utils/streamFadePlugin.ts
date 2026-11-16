/*
  Wraps every word of a streaming reply in `<span class="stream-word">` so the words that arrive with a new
  chunk can fade in (see `.streaming-words` in `pages/ChatPage/streaming.css`).

  The fade needs no bookkeeping about which words are new. React keeps the span of a word that was already on
  screen (same position in the same parent), so only the spans that are mounted by the new chunk start their CSS
  animation. A word still being typed ("hel" then "hello") stays in the same span and does not restart it.

  Only used while a reply is streaming: a finished or historical reply keeps its plain text nodes, so a long
  chat does not carry one extra element per word.
*/

interface HastNode {
    type: string;
    value?: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: HastNode[];
}

/** Text inside these is not prose: code must stay one text node for the highlighter, and math is typeset later. */
const SKIPPED_TAGS = new Set(['pre', 'code', 'svg', 'script', 'style', 'textarea']);

const hasMathClass = (node: HastNode): boolean => {
    const cls = node.properties?.className;
    const list = Array.isArray(cls) ? cls : typeof cls === 'string' ? cls.split(' ') : [];
    return list.some(c => typeof c === 'string' && (c.startsWith('katex') || c.startsWith('math')));
};

const wrapWords = (value: string): HastNode[] =>
    value.split(/(\s+)/).filter(part => part !== '').map(part =>
        /^\s+$/.test(part)
            ? {type: 'text', value: part}
            : {
                type: 'element',
                tagName: 'span',
                properties: {className: ['stream-word']},
                children: [{type: 'text', value: part}],
            },
    );

const visit = (node: HastNode): void => {
    if (!node.children) return;
    if (node.type === 'element' && (SKIPPED_TAGS.has(node.tagName ?? '') || hasMathClass(node))) return;
    const next: HastNode[] = [];
    for (const child of node.children) {
        if (child.type === 'text' && child.value) {
            next.push(...wrapWords(child.value));
        } else {
            visit(child);
            next.push(child);
        }
    }
    node.children = next;
};

/** A rehype plugin (unified attacher). */
export const rehypeStreamFade = () => (tree: HastNode) => {
    visit(tree);
};
