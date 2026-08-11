import { createHighlighter, bundledLanguages, type Highlighter } from 'shiki';
import type { BundledLanguage, BundledTheme } from 'shiki';
import type { CodeHighlighterPlugin, HighlightOptions } from 'streamdown';

// Streamdown exports the plugin interface but not its result type, so derive it
// from the interface rather than restating the shape and risking drift.
type HighlightResult = NonNullable<ReturnType<CodeHighlighterPlugin['highlight']>>;

// Streamdown ships no highlighter of its own: `<Streamdown shikiTheme={...}>`
// only names the themes, and the code block falls back to one span per line
// with `color: inherit` unless `plugins.code` supplies an actual highlighter
// (issue #282). This module is that highlighter.
//
// It uses Shiki's full bundle. Registering grammars one by one looks cheaper
// but is not: `vite.config.ts` sets `inlineDynamicImports: true` (JCEF cannot
// fetch split chunks), so hand-picked grammars ship in full and duplicate the
// shared parts they embed. Measured against a 788 kB gzip baseline, 36
// hand-picked languages cost +360 kB while the whole bundle costs +319 kB —
// less bytes for every language instead of a chosen few. It also removes the
// language list and its alias table (`ts`, `sh`, …), which Shiki resolves
// itself, and with them the risk of a fence quietly rendering uncoloured
// because a spelling was missing from our map.
const THEMES: [BundledTheme, BundledTheme] = ['github-light', 'github-dark'];

let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

// Shiki resolves aliases (`ts` → typescript) through this map, so membership
// here is the same question as "will Shiki accept this fence?".
const isSupported = (language: string): language is BundledLanguage =>
    Object.prototype.hasOwnProperty.call(bundledLanguages, language);

const loadHighlighter = (): Promise<Highlighter> => {
    highlighterPromise ??= createHighlighter({
        themes: [...THEMES],
        // Grammars are loaded per language on first use; preloading all of them
        // would parse every grammar in the bundle at startup.
        langs: [],
    }).then((created) => {
        highlighter = created;
        return created;
    });
    return highlighterPromise;
};

const languagePromises = new Map<string, Promise<void>>();

const loadLanguage = (language: BundledLanguage): Promise<void> => {
    let pending = languagePromises.get(language);
    if (!pending) {
        pending = loadHighlighter().then((core) => core.loadLanguage(language));
        languagePromises.set(language, pending);
    }
    return pending;
};

const tokenize = (core: Highlighter, options: HighlightOptions): HighlightResult => {
    const result = core.codeToTokens(options.code, {
        lang: options.language,
        themes: { light: THEMES[0], dark: THEMES[1] },
    });
    return { tokens: result.tokens, fg: result.fg, bg: result.bg };
};

export const code: CodeHighlighterPlugin = {
    name: 'shiki',
    type: 'code-highlighter',

    // Synchronous once the grammar is loaded — the common case after a session
    // has rendered one block of a language, and what keeps re-renders during
    // streaming from flashing back to uncoloured text. Otherwise return null
    // and resolve through the callback, the contract Streamdown documents for
    // async highlighters.
    highlight: (options, callback) => {
        const language = options.language as string;
        if (!isSupported(language)) {
            return null;
        }

        if (highlighter?.getLoadedLanguages().includes(language)) {
            return tokenize(highlighter, options);
        }

        if (callback) {
            void loadLanguage(language)
                .then(() => {
                    if (highlighter) {
                        callback(tokenize(highlighter, options));
                    }
                })
                // A grammar that fails to load must not take the chat down with
                // it: the block simply stays on Streamdown's uncoloured
                // fallback, which is how every block looked before this plugin.
                .catch(() => undefined);
        }

        return null;
    },

    supportsLanguage: (language) => isSupported(language as string),

    getSupportedLanguages: () => Object.keys(bundledLanguages) as BundledLanguage[],

    getThemes: () => THEMES,
};
