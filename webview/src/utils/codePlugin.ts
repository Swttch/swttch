import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
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
// Languages are registered explicitly rather than pulling Shiki's full bundle.
// `vite.config.ts` sets `inlineDynamicImports: true` (JCEF fails to fetch split
// chunks), so every grammar imported here lands in the main bundle whether or
// not it is ever used — the full bundle measured at roughly +320 kB gzip. The
// list below is therefore scoped to what Claude actually emits, taken from a
// count of fenced-code languages across local session transcripts. Anything
// outside it degrades to Streamdown's uncoloured fallback, which is exactly
// what every block looked like before this plugin existed.
const THEMES: [BundledTheme, BundledTheme] = ['github-light', 'github-dark'];

const LANGUAGE_LOADERS = {
    bash: () => import('shiki/langs/bash.mjs'),
    css: () => import('shiki/langs/css.mjs'),
    diff: () => import('shiki/langs/diff.mjs'),
    html: () => import('shiki/langs/html.mjs'),
    java: () => import('shiki/langs/java.mjs'),
    javascript: () => import('shiki/langs/javascript.mjs'),
    json: () => import('shiki/langs/json.mjs'),
    jsx: () => import('shiki/langs/jsx.mjs'),
    kotlin: () => import('shiki/langs/kotlin.mjs'),
    markdown: () => import('shiki/langs/markdown.mjs'),
    python: () => import('shiki/langs/python.mjs'),
    sql: () => import('shiki/langs/sql.mjs'),
    tsx: () => import('shiki/langs/tsx.mjs'),
    typescript: () => import('shiki/langs/typescript.mjs'),
    xml: () => import('shiki/langs/xml.mjs'),
    yaml: () => import('shiki/langs/yaml.mjs'),
} as const;

type SupportedLanguage = keyof typeof LANGUAGE_LOADERS;

// Fences are written by hand far more often than not, and the short forms are
// the common ones: `ts` and `js` outrank their spelled-out names in transcripts,
// and `sh` is written more often than `bash`. Without these, the most-used
// fences in practice would silently fall back to no colour at all.
const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
    cjs: 'javascript',
    console: 'bash',
    htm: 'html',
    js: 'javascript',
    jsonc: 'json',
    kt: 'kotlin',
    kts: 'kotlin',
    md: 'markdown',
    mjs: 'javascript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    ts: 'typescript',
    yml: 'yaml',
    zsh: 'bash',
};

const resolveLanguage = (language: string): SupportedLanguage | null => {
    if (Object.prototype.hasOwnProperty.call(LANGUAGE_LOADERS, language)) {
        return language as SupportedLanguage;
    }
    return LANGUAGE_ALIASES[language] ?? null;
};

const SUPPORTED_LANGUAGES = [
    ...Object.keys(LANGUAGE_LOADERS),
    ...Object.keys(LANGUAGE_ALIASES),
] as SupportedLanguage[];

let highlighter: HighlighterCore | null = null;
let highlighterPromise: Promise<HighlighterCore> | null = null;

// The JavaScript regex engine keeps us off the oniguruma WASM binary, which
// would need to be fetched at runtime — an extra network/file dependency the
// JCEF webview does not need.
const loadHighlighter = (): Promise<HighlighterCore> => {
    highlighterPromise ??= (async () => {
        const [light, dark] = await Promise.all([
            import('shiki/themes/github-light.mjs'),
            import('shiki/themes/github-dark.mjs'),
        ]);
        const created = await createHighlighterCore({
            themes: [light.default, dark.default],
            langs: [],
            engine: createJavaScriptRegexEngine(),
        });
        highlighter = created;
        return created;
    })();
    return highlighterPromise;
};

const loadedLanguages = new Set<SupportedLanguage>();
const languagePromises = new Map<SupportedLanguage, Promise<void>>();

const loadLanguage = (language: SupportedLanguage): Promise<void> => {
    let pending = languagePromises.get(language);
    if (!pending) {
        pending = (async () => {
            const core = await loadHighlighter();
            const grammar = await LANGUAGE_LOADERS[language]();
            await core.loadLanguage(grammar.default);
            loadedLanguages.add(language);
        })();
        languagePromises.set(language, pending);
    }
    return pending;
};

// Tokenize under the resolved grammar name, not the fence's own spelling: the
// highlighter was loaded as `typescript`, so asking it for `ts` would throw.
const tokenize = (
    core: HighlighterCore,
    options: HighlightOptions,
    language: SupportedLanguage,
): HighlightResult => {
    const result = core.codeToTokens(options.code, {
        lang: language,
        themes: { light: THEMES[0], dark: THEMES[1] },
    });
    return { tokens: result.tokens, fg: result.fg, bg: result.bg };
};

export const code: CodeHighlighterPlugin = {
    name: 'shiki',
    type: 'code-highlighter',

    // Synchronous when the grammar is already loaded — that is the common case
    // once a session has rendered one block of a given language, and it keeps
    // re-renders during streaming from flashing back to uncoloured text.
    // Otherwise return null and resolve through the callback, which is the
    // contract Streamdown documents for async highlighters.
    highlight: (options, callback) => {
        const language = resolveLanguage(options.language as string);
        if (!language) {
            return null;
        }

        if (highlighter && loadedLanguages.has(language)) {
            return tokenize(highlighter, options, language);
        }

        if (callback) {
            void loadLanguage(language)
                .then(() => {
                    if (highlighter) {
                        callback(tokenize(highlighter, options, language));
                    }
                })
                // A missing grammar must not take the chat down with it: the
                // block simply stays on Streamdown's uncoloured fallback.
                .catch(() => undefined);
        }

        return null;
    },

    supportsLanguage: (language) => resolveLanguage(language as string) !== null,

    getSupportedLanguages: () => SUPPORTED_LANGUAGES as unknown as BundledLanguage[],

    getThemes: () => THEMES,
};
