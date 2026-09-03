/** @type {import('tailwindcss').Config} */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /**
       * `xs` covers the small-phone floor. A 320px-wide iPhone SE is still in
       * real use, and Tailwind's smallest default breakpoint is 640px — so
       * everything between 320 and 640 was being designed by accident.
       */
      screens: {
        xs: '400px',
        // Wide desktops and ultrawides: without this the content column stops
        // growing at 1536px and the layout looks lost on a 34" monitor.
        '3xl': '1800px',
        /** Opt-in fine-pointer styling, so hover effects do not stick on touch. */
        pointer: { raw: '(hover: hover) and (pointer: fine)' },
        /** Short viewports — a phone in landscape, or a small laptop. */
        'h-sm': { raw: '(max-height: 720px)' },
      },
      colors: {
        bg: { DEFAULT: channel('bg'), subtle: channel('bg-subtle') },
        surface: {
          DEFAULT: channel('surface'),
          2: channel('surface-2'),
          3: channel('surface-3'),
        },
        line: { DEFAULT: channel('border'), strong: channel('border-strong') },
        ink: {
          DEFAULT: channel('text'),
          muted: channel('text-muted'),
          faint: channel('text-faint'),
        },
        accent: {
          DEFAULT: channel('accent'),
          hover: channel('accent-hover'),
          soft: channel('accent-soft'),
          fg: channel('accent-text'),
        },
        success: { DEFAULT: channel('success'), soft: channel('success-soft') },
        warn: { DEFAULT: channel('warn'), soft: channel('warn-soft') },
        danger: { DEFAULT: channel('danger'), soft: channel('danger-soft') },
        info: { DEFAULT: channel('info'), soft: channel('info-soft') },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'var(--font-inter)', 'ui-sans-serif', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.04em' }],
        /**
         * Fluid display sizes.
         *
         * `clamp` rather than a breakpoint ladder: a hero that steps from 36px
         * to 48px at exactly 640px looks broken on every width in between, and
         * there are a lot of those between a 360px phone and a 1440px laptop.
         */
        'fluid-hero': ['clamp(1.5rem, 1.05rem + 2vw, 3rem)', { lineHeight: '1.12', letterSpacing: '-0.02em' }],
        'fluid-h2': ['clamp(1.375rem, 1.05rem + 1.5vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.015em' }],
        'fluid-h3': ['clamp(1.125rem, 1rem + 0.6vw, 1.5rem)', { lineHeight: '1.25' }],
      },
      borderRadius: {
        card: '14px',
        panel: '18px',
      },
      spacing: {
        sidebar: '15rem',
        /** 18px. Used for icons between h-4 and h-5; absent from Tailwind's scale,
         *  so 'h-4.5' was silently producing no height at all. */
        4.5: '1.125rem',
        /** WCAG 2.5.8 minimum target size. */
        touch: '2.75rem',
        /** Height of the mobile tab bar, so content can clear it. */
        tabbar: '3.75rem',
        /** iOS home-bar / notch insets, safe to use on every platform. */
        'safe-b': 'env(safe-area-inset-bottom, 0px)',
        'safe-t': 'env(safe-area-inset-top, 0px)',
        'safe-l': 'env(safe-area-inset-left, 0px)',
        'safe-r': 'env(safe-area-inset-right, 0px)',
      },
      minHeight: {
        touch: '2.75rem',
      },
      minWidth: {
        touch: '2.75rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'slide-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        pulse_ring: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgb(var(--accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-left': 'slide-in-left 0.24s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-ring': 'pulse_ring 2.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};
