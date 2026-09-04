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
        /** Very short — a phone in landscape with the keyboard up. */
        'h-xs': { raw: '(max-height: 560px)' },
      },
      colors: {
        bg: { DEFAULT: channel('bg'), subtle: channel('bg-subtle') },
        surface: {
          DEFAULT: channel('surface'),
          2: channel('surface-2'),
          3: channel('surface-3'),
          /** Inset wells: progress tracks, empty slots, code blocks. */
          sunken: channel('surface-sunken'),
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
          /**
           * Graphics-only amber, brighter than `accent`.
           *
           * `accent` is pinned to a value that clears AA as *text* on the page
           * background, which in light mode makes it noticeably brown. Fills,
           * strokes and glyphs above 24px are held to 3:1 rather than 4.5:1,
           * so they can carry warmth the text colour cannot. Never body text.
           */
          vivid: channel('accent-vivid'),
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
        'fluid-hero': ['clamp(1.75rem, 1.1rem + 2.6vw, 3.5rem)', { lineHeight: '1.08', letterSpacing: '-0.03em' }],
        'fluid-h2': ['clamp(1.375rem, 1.05rem + 1.5vw, 2.25rem)', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        /** The standard screen title inside the app. */
        'fluid-h3': ['clamp(1.25rem, 1.1rem + 0.75vw, 1.75rem)', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        /** Inputs, chips, small controls. */
        field: '10px',
        card: '14px',
        panel: '18px',
      },
      boxShadow: {
        /**
         * `shadow-xs` is a Tailwind v4 name that seven call sites were already
         * written against. Under v3 it resolved to nothing at all, so those
         * elements rendered flat. Defining it here makes them render.
         */
        xs: '0 1px 2px rgb(var(--shadow-color) / 0.05)',
        /** Elevation ladder; --shadow-color retunes it per theme. */
        e1: '0 1px 2px rgb(var(--shadow-color) / 0.05)',
        e2: '0 1px 2px rgb(var(--shadow-color) / 0.06), 0 6px 16px -8px rgb(var(--shadow-color) / 0.10)',
        e3: '0 2px 4px rgb(var(--shadow-color) / 0.06), 0 16px 40px -12px rgb(var(--shadow-color) / 0.18)',
        /** "This is the live thing" — accent-tinted focus elevation. */
        glow: '0 0 0 1px rgb(var(--accent) / 0.18), 0 8px 30px -12px rgb(var(--accent) / 0.35)',
      },
      spacing: {
        sidebar: '15rem',
        /** Wider rail on very large screens, where 15rem looks starved. */
        'sidebar-lg': '17rem',
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
      maxWidth: {
        /**
         * Reading measure for prose-heavy panels. Long lines are the single
         * biggest legibility cost on a wide monitor.
         */
        measure: '68ch',
        /** The app's standard content column, one step past Tailwind's 6xl. */
        content: '78rem',
      },
      minHeight: { touch: '2.75rem' },
      minWidth: { touch: '2.75rem' },
      transitionTimingFunction: {
        /** The house easing. Fast out, long settle — reads as physical. */
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
      },
      keyframes: {
        'slide-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        /** Radix Accordion drives these from its measured content height. */
        'accordion-down': {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
          to: { height: '0', opacity: '0' },
        },
        pulse_ring: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgb(var(--accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0)' },
        },
        /** A highlight travelling down the spine rail while a plan builds. */
        'spine-travel': {
          '0%': { transform: 'translateY(-120%)' },
          '100%': { transform: 'translateY(420%)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-left': 'slide-in-left 0.24s cubic-bezier(0.16,1,0.3,1) both',
        'accordion-down': 'accordion-down 0.24s cubic-bezier(0.16,1,0.3,1)',
        'accordion-up': 'accordion-up 0.2s cubic-bezier(0.16,1,0.3,1)',
        'pulse-ring': 'pulse_ring 2.2s ease-out infinite',
        'spine-travel': 'spine-travel 2.6s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
