/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    // Custom `2xs` (320px) and `xs` (440px) breakpoints added below the default
    // `sm` (640px). Smaller-than-default breakpoints must redefine the full
    // `screens` map in order (not via `extend`), otherwise they would be emitted
    // after `sm`..`2xl` and break mobile-first cascade ordering.
    screens: {
      '2xs': '320px',
      xs: '440px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // Legacy (deprecated, remove after migration)
        'ide-bg': 'var(--ide-bg)',
        'ide-fg': 'var(--ide-fg)',
        'ide-border': 'var(--ide-border)',
        'ide-accent': 'var(--ide-accent)',
        'ide-error': 'var(--ide-error)',
        'ide-warning': 'var(--ide-warning)',
        'ide-success': 'var(--ide-success)',

        // Surface
        // Channelized tokens use `rgb(var(--x-rgb) / <alpha-value>)` so Tailwind
        // opacity modifiers (e.g. bg-surface-base/80) work. `selected` keeps
        // `var()` because it is IDE-injected and may not be a solid RGB color.
        surface: {
          base: 'rgb(var(--surface-base-rgb) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised-rgb) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay-rgb) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken-rgb) / <alpha-value>)',
          hover: 'rgb(var(--surface-hover-rgb) / <alpha-value>)',
          pressed: 'rgb(var(--surface-pressed-rgb) / <alpha-value>)',
          selected: 'var(--surface-selected)',
          tooltip: 'rgb(var(--surface-tooltip-rgb) / <alpha-value>)',
        },

        // Text  (usage: text-text-primary, text-text-primary/80 ...)
        text: {
          primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          tertiary: 'rgb(var(--text-tertiary-rgb) / <alpha-value>)',
          disabled: 'rgb(var(--text-disabled-rgb) / <alpha-value>)',
          inverse: 'rgb(var(--text-inverse-rgb) / <alpha-value>)',
          link: 'rgb(var(--text-link-rgb) / <alpha-value>)',
          'on-tooltip': 'rgb(var(--text-on-tooltip-rgb) / <alpha-value>)',
        },

        // Border (usage: border-border-default, border-border-focus)
        border: {
          subtle: 'rgb(var(--border-subtle-rgb) / <alpha-value>)',
          default: 'rgb(var(--border-default-rgb) / <alpha-value>)',
          strong: 'rgb(var(--border-strong-rgb) / <alpha-value>)',
          focus: 'rgb(var(--border-focus-rgb) / <alpha-value>)',
          divider: 'rgb(var(--border-divider-rgb) / <alpha-value>)',
        },

        // Accent
        // `primary-subtle` stays `var()` because dark theme defines it as rgba.
        accent: {
          DEFAULT: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
          primary: 'rgb(var(--accent-primary-rgb) / <alpha-value>)',
          'primary-hover': 'rgb(var(--accent-primary-hover-rgb) / <alpha-value>)',
          'primary-pressed': 'rgb(var(--accent-primary-pressed-rgb) / <alpha-value>)',
          'primary-fg': 'rgb(var(--accent-primary-fg-rgb) / <alpha-value>)',
          'primary-subtle': 'var(--accent-primary-subtle)',
          claude: 'rgb(var(--accent-claude-rgb) / <alpha-value>)',
          'claude-hover': 'rgb(var(--accent-claude-hover-rgb) / <alpha-value>)',
        },

        // State (usage: bg-state-success-bg, text-state-success-fg)
        // Only the `-fg` tokens are channelized; `-bg`/`-border` stay `var()`
        // because the dark theme defines them as rgba (alpha already baked in).
        state: {
          'success-bg':     'var(--state-success-bg)',
          'success-fg':     'rgb(var(--state-success-fg-rgb) / <alpha-value>)',
          'success-border': 'var(--state-success-border)',
          'warning-bg':     'var(--state-warning-bg)',
          'warning-fg':     'rgb(var(--state-warning-fg-rgb) / <alpha-value>)',
          'warning-border': 'var(--state-warning-border)',
          'error-bg':       'var(--state-error-bg)',
          'error-fg':       'rgb(var(--state-error-fg-rgb) / <alpha-value>)',
          'error-border':   'var(--state-error-border)',
          'info-bg':        'var(--state-info-bg)',
          'info-fg':        'rgb(var(--state-info-fg-rgb) / <alpha-value>)',
          'info-border':    'var(--state-info-border)',
          'pending-bg':     'var(--state-pending-bg)',
          'pending-fg':     'rgb(var(--state-pending-fg-rgb) / <alpha-value>)',
          'pending-border': 'var(--state-pending-border)',
        },

        // Full-width banners (usage: bg-banner-info-bg, border-banner-info-border)
        // Opaque bakes of the `state-info-*` tokens, for bars that span the
        // viewport and stay on screen — see the `--banner-info-*` comment in
        // index.css for why those must not be translucent.
        banner: {
          'info-bg':     'var(--banner-info-bg)',
          'info-border': 'var(--banner-info-border)',
        },

        // Overlay (usage: bg-overlay-scrim)
        overlay: {
          scrim: 'var(--overlay-scrim)',
          dim: 'var(--overlay-dim)',
        },

        // Tool call rows (usage: text-tool-label-fg)
        tool: {
          'label-fg': 'var(--tool-label-fg)',
        },
      },
      boxShadow: {
        'token-sm': 'var(--shadow-sm)',
        'token-md': 'var(--shadow-md)',
        'token-lg': 'var(--shadow-lg)',
      },
      ringColor: {
        focus: 'rgb(var(--border-focus-rgb) / <alpha-value>)',
      },
      fontFamily: {
        'ide-ui': 'var(--ide-font-ui)',
        'ide-code': 'var(--ide-font-code)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-subtle': 'pulseSubtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        // Grows from nothing to a row's height, so the rows below it slide down
        // rather than jumping. The cap is generous enough for the tallest row;
        // once the animation ends the element falls back to its natural height.
        slotOpen: {
          '0%': { maxHeight: '0', opacity: '0' },
          '100%': { maxHeight: '8rem', opacity: '1' },
        },
      },
    }
  },
  plugins: []
};
