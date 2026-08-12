import { describe, expect, it } from 'vitest';
import { code } from '../codePlugin';

// Regression cover for issue #282: code blocks rendered with one span per line
// and `color: inherit`, i.e. Streamdown's uncoloured fallback, because no
// `plugins.code` highlighter was ever supplied. Passing `shikiTheme` alone does
// not highlight anything — these tests pin the highlighter contract instead.

const highlightAsync = (source: string, language: string) =>
    new Promise<ReturnType<typeof code.highlight>>((resolve) => {
        const immediate = code.highlight(
            // The plugin narrows `language` to Shiki's BundledLanguage union;
            // tests deliberately pass plain strings, including unsupported ones.
            { code: source, language, themes: ['github-light', 'github-dark'] } as never,
            (result) => resolve(result),
        );
        if (immediate) {
            resolve(immediate);
        }
    });

describe('code highlighter plugin', () => {
    it('declares the shape Streamdown dispatches on', () => {
        expect(code.name).toBe('shiki');
        expect(code.type).toBe('code-highlighter');
    });

    it('reports themes in Shiki order: light first, dark second', () => {
        // Streamdown reads themes from the plugin, so a flipped pair here would
        // silently paint dark colours in light mode.
        expect(code.getThemes()).toEqual(['github-light', 'github-dark']);
    });

    it('splits a line into per-token spans rather than one span per line', async () => {
        const result = await highlightAsync('function greet(name) {}', 'javascript');

        expect(result).not.toBeNull();
        expect(result?.tokens).toHaveLength(1);
        // The bug produced exactly one token per line; real tokenization splits
        // `function`, whitespace, `greet`, punctuation and so on.
        expect(result?.tokens[0].length).toBeGreaterThan(1);
    });

    it('assigns real colours to tokens instead of `inherit`', async () => {
        const result = await highlightAsync('const answer = 42;', 'typescript');
        const tokens = result?.tokens[0] ?? [];
        const colours = tokens.map(
            (token) => token.color ?? token.htmlStyle?.color,
        );

        expect(colours.some((colour) => colour && colour !== 'inherit')).toBe(true);
        expect(colours).not.toContain('inherit');
    });

    it('carries a dark-theme colour per token for the dark-mode swap', async () => {
        const result = await highlightAsync('const answer = 42;', 'typescript');
        const tokens = result?.tokens[0] ?? [];

        // streaming.css maps `--shiki-dark` onto `color` under `.dark`; without
        // this variable dark mode would keep the light palette.
        expect(
            tokens.some((token) => token.htmlStyle?.['--shiki-dark']),
        ).toBe(true);
    });

    it('highlights compiled languages, not just the web stack', async () => {
        // An earlier revision hand-picked a language list built from one
        // developer's transcripts, which left C/C++/C#/Go/Rust rendering
        // uncoloured — issue #282 all over again for anyone not writing
        // TypeScript. Shipping Shiki's full bundle is what fixes that.
        const samples: Array<[language: string, source: string]> = [
            ['c', '#include <stdio.h>'],
            ['cpp', 'int main() { return 0; }'],
            ['csharp', 'public class Greeter { }'],
            ['go', 'func main() { println("hi") }'],
            ['rust', 'fn main() { println!("hi"); }'],
        ];

        for (const [language, source] of samples) {
            expect(code.supportsLanguage(language as never)).toBe(true);

            const result = await highlightAsync(source, language);
            expect(
                result?.tokens[0].length,
                `${language} should tokenize`,
            ).toBeGreaterThan(1);
        }
    });

    it('highlights the web stack it already covered', async () => {
        for (const language of ['python', 'kotlin', 'json', 'bash']) {
            expect(code.supportsLanguage(language as never)).toBe(true);
            const result = await highlightAsync('x = 1', language);
            expect(result?.tokens.length).toBeGreaterThan(0);
        }
    });

    it('highlights short fence aliases like ts, js and sh', async () => {
        // These outrank their spelled-out forms in real transcripts, so treating
        // them as unknown would leave the most common blocks uncoloured. Shiki
        // resolves the aliases itself; this pins that we route them to it
        // rather than filtering them out first. Each sample has to be valid in
        // its own language, otherwise the grammar legitimately yields a single
        // plain-text token.
        const samples: Array<[alias: string, source: string]> = [
            ['ts', 'const answer: number = 42;'],
            ['js', 'const answer = 42;'],
            ['sh', 'echo "hello"'],
            ['yml', 'key: value'],
            ['py', 'def greet(name): pass'],
        ];

        for (const [alias, source] of samples) {
            expect(code.supportsLanguage(alias as never)).toBe(true);

            const result = await highlightAsync(source, alias);
            expect(
                result?.tokens[0].length,
                `alias ${alias} should tokenize`,
            ).toBeGreaterThan(1);
        }
    });

    it('falls back instead of throwing on an unregistered language', () => {
        expect(code.supportsLanguage('brainfuck' as never)).toBe(false);
        // Returning null leaves Streamdown on its plain-text rendering, which is
        // the pre-existing behaviour — never an exception that breaks the chat.
        expect(
            code.highlight(
                { code: '++++', language: 'brainfuck', themes: ['github-light', 'github-dark'] } as never,
            ),
        ).toBeNull();
    });

    it('returns cached results synchronously once a grammar is loaded', async () => {
        await highlightAsync('const a = 1;', 'javascript');

        // A synchronous hit matters during streaming: an async-only path would
        // drop back to uncoloured text on every re-render.
        const immediate = code.highlight({
            code: 'const b = 2;',
            language: 'javascript',
            themes: ['github-light', 'github-dark'],
        } as never);

        expect(immediate).not.toBeNull();
        expect(immediate?.tokens[0].length).toBeGreaterThan(1);
    });
});
