import { describe, it, expect } from 'vitest';
import { rehypeStreamFade } from '../streamFadePlugin';

const text = (value: string) => ({ type: 'text', value });
const el = (tagName: string, children: unknown[], className?: string[]) => ({
    type: 'element', tagName, properties: className ? { className } : {}, children,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (tree: any) => { rehypeStreamFade()(tree); return tree; };

describe('rehypeStreamFade', () => {
    it('wraps each word of a paragraph in a stream-word span and keeps the spaces as text', () => {
        const tree = run({ type: 'root', children: [el('p', [text('hello big  world')])] });
        const kids = tree.children[0].children;
        expect(kids.map((k: { type: string }) => k.type)).toEqual(['element', 'text', 'element', 'text', 'element']);
        expect(kids[0].properties.className).toEqual(['stream-word']);
        expect(kids[0].children[0].value).toBe('hello');
        expect(kids[3].value).toBe('  ');
    });

    it('leaves code blocks, inline code and math as they are', () => {
        const pre = el('pre', [el('code', [text('const a = 1')])]);
        const inline = el('code', [text('a b')]);
        const math = el('span', [text('x y')], ['katex']);
        const tree = run({ type: 'root', children: [pre, el('p', [inline, math])] });
        expect(tree.children[0].children[0].children[0].value).toBe('const a = 1');
        expect(tree.children[1].children[0].children[0].value).toBe('a b');
        expect(tree.children[1].children[1].children[0].value).toBe('x y');
    });

    it('wraps text nested inside inline formatting', () => {
        const tree = run({ type: 'root', children: [el('p', [el('strong', [text('bold word')])])] });
        const strongKids = tree.children[0].children[0].children;
        expect(strongKids.filter((k: { type: string }) => k.type === 'element')).toHaveLength(2);
    });
});
