import { useMemo, useSyncExternalStore } from 'react';
import type { MermaidConfig } from 'mermaid';
import type { DiagramPlugin, MermaidOptions } from 'streamdown';

// Streamdown draws a ```mermaid fence through this plugin (issue #556). It
// ships the diagram component and its controls, but not mermaid itself.
//
// mermaid is several megabytes, so it is imported the first time a diagram is
// actually drawn rather than with the chat. A session that never shows one
// never pays for it.
type Mermaid = (typeof import('mermaid'))['default'];

let mermaidPromise: Promise<Mermaid> | null = null;

const loadMermaid = (): Promise<Mermaid> => {
    mermaidPromise ??= import('mermaid').then((module) => module.default);
    return mermaidPromise;
};

// The chart comes from the model, so it is treated like any other untrusted
// markup: `strict` escapes HTML in labels and turns off `click` callbacks.
// `startOnLoad` is off because Streamdown decides when each diagram renders.
const BASE_CONFIG: MermaidConfig = {
    startOnLoad: false,
    securityLevel: 'strict',
    fontFamily: 'inherit',
};

// `.dark` on <html> is the theme the webview is showing right now (set by
// SettingsContext).
const isDark = (): boolean => document.documentElement.classList.contains('dark');

const themeFor = (dark: boolean): MermaidConfig['theme'] => (dark ? 'dark' : 'default');

export const mermaid: DiagramPlugin = {
    name: 'mermaid',
    type: 'diagram',
    language: 'mermaid',

    getMermaid: (config?: MermaidConfig) => ({
        // Streamdown never calls this itself; the config it would pass arrives
        // through `getMermaid` and is applied on every render below.
        initialize: () => {},
        render: async (id: string, source: string) => {
            const instance = await loadMermaid();
            // `initialize` is global to mermaid, and the theme can change between
            // two diagrams, so it is set again right before each one is drawn.
            // The theme read here is only a fallback for a caller that passes no
            // config; `useMermaidOptions` normally supplies it.
            instance.initialize({ ...BASE_CONFIG, theme: themeFor(isDark()), ...config });
            const { svg } = await instance.render(id, source);
            return { svg };
        },
    }),
};

const subscribeToTheme = (onChange: () => void): (() => void) => {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
};

/**
 * The `mermaid` prop for `<Streamdown>`: the theme the webview is in.
 *
 * mermaid writes its colours into the SVG, so a diagram drawn before a theme
 * switch would keep the old colours — dark boxes on a light page. Streamdown
 * redraws a diagram when this config changes, so handing it the theme is what
 * makes diagrams already on screen follow the switch.
 *
 * Read off the `.dark` class rather than `useThemeContext`, which throws
 * outside a ThemeProvider and would make every renderer that shows markdown
 * depend on one.
 */
export function useMermaidOptions(): MermaidOptions {
    const dark = useSyncExternalStore(subscribeToTheme, isDark);
    return useMemo(() => ({ config: { theme: themeFor(dark) } }), [dark]);
}

// The buttons on a drawn diagram. Download is off, as it already is for code
// blocks (streaming.css): Streamdown saves through an `<a download>` click, and
// the plugin registers no CEF download handler, so in the IDE the click goes
// nowhere. Copy (the source), fullscreen and pan/zoom stay inside the page.
export const MERMAID_CONTROLS = {
    download: false,
    copy: true,
    fullscreen: true,
    panZoom: true,
} as const;
