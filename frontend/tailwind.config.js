const plugin = require('tailwindcss/plugin');

/** @type {import('tailwindcss').Config} */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/**
 * Kairo — Aurora Glass.
 *
 * The token names are semantic, never literal: `accent`, not `violet`. That is
 * what let the whole app change theme by rewriting one CSS file — every one of
 * the ~40 components was already asking for "the accent" rather than for a
 * specific hue.
 */
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
        /**
         * Devices that can actually afford the expensive layers.
         *
         * `backdrop-filter` on a dozen simultaneous panels is the one thing in
         * this design that can drop frames on a budget phone. Gating the
         * heaviest blurs behind this keeps the glass on hardware that can hold
         * 60fps and gives everyone else a flat, fast, still-correct surface.
         */
        rich: { raw: '(min-width: 768px) and (hover: hover) and (pointer: fine)' },
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
        /** The glass system's own channels, for one-off compositions. */
        glass: { DEFAULT: channel('glass-bg'), edge: channel('glass-edge') },
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
           * Graphics-only violet, brighter than `accent`.
           *
           * `accent` is pinned to a value that clears AA as *text* on the page
           * background. Fills, strokes and glyphs above 24px are held to 3:1
           * rather than 4.5:1, so they can carry saturation the text colour
           * cannot. Never body text.
           */
          vivid: channel('accent-vivid'),
        },
        /**
         * The second accent: cyan.
         *
         * Carries *quantity* — progress, throughput, data — while violet
         * carries *state*. Keeping those two jobs on two hues is what stops the
         * palette from turning into decoration.
         */
        cyan: {
          DEFAULT: channel('accent-2'),
          vivid: channel('accent-2-vivid'),
        },
        /** The third accent. One highlight per screen, at most. Never a state. */
        magenta: channel('accent-3'),
        success: { DEFAULT: channel('success'), soft: channel('success-soft') },
        warn: { DEFAULT: channel('warn'), soft: channel('warn-soft') },
        danger: { DEFAULT: channel('danger'), soft: channel('danger-soft') },
        info: { DEFAULT: channel('info'), soft: channel('info-soft') },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-outfit)', 'var(--font-inter)', 'ui-sans-serif', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        /**
         * Long-form prose only — coach answers, topic summaries, outcomes.
         *
         * Never for controls. A serif button label reads as a rendering
         * accident, and the whole value of the pairing is that the two faces
         * mean two different things: `sans` is the app talking, `reading` is
         * the material.
         */
        reading: ['var(--font-reading)', 'ui-serif', 'Georgia', 'serif'],
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
        'fluid-hero': ['clamp(2rem, 1.15rem + 3.4vw, 4.25rem)', { lineHeight: '1.04', letterSpacing: '-0.035em' }],
        'fluid-h2': ['clamp(1.5rem, 1.1rem + 1.7vw, 2.5rem)', { lineHeight: '1.12', letterSpacing: '-0.025em' }],
        /** The standard screen title inside the app. */
        'fluid-h3': ['clamp(1.25rem, 1.1rem + 0.75vw, 1.75rem)', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        /** Oversized numerals — streaks, day counts, the progress ring centre. */
        'fluid-stat': ['clamp(1.75rem, 1.2rem + 2vw, 3rem)', { lineHeight: '1', letterSpacing: '-0.04em' }],
      },
      borderRadius: {
        /** Inputs, chips, small controls. */
        field: '11px',
        card: '16px',
        panel: '22px',
        /** The largest containers — hero mocks, modal shells. */
        shell: '28px',
      },
      boxShadow: {
        /**
         * `shadow-xs` is a Tailwind v4 name that seven call sites were already
         * written against. Under v3 it resolved to nothing at all, so those
         * elements rendered flat. Defining it here makes them render.
         */
        xs: '0 1px 2px rgb(var(--shadow-color) / 0.06)',
        /** Elevation ladder; --shadow-color retunes it per theme. */
        e1: '0 1px 2px rgb(var(--shadow-color) / 0.08)',
        e2: '0 1px 2px rgb(var(--shadow-color) / 0.10), 0 8px 22px -10px rgb(var(--shadow-color) / 0.28)',
        e3: '0 2px 4px rgb(var(--shadow-color) / 0.12), 0 24px 56px -16px rgb(var(--shadow-color) / 0.45)',
        /** The deepest layer: modals and the hero mock, genuinely off the page. */
        e4: '0 4px 8px rgb(var(--shadow-color) / 0.14), 0 40px 90px -24px rgb(var(--shadow-color) / 0.6)',
        /** "This is the live thing" — accent-tinted focus elevation. */
        glow: '0 0 0 1px rgb(var(--accent) / 0.22), 0 8px 34px -12px rgb(var(--accent) / 0.5)',
        /** A stronger bloom, for the one element being acted on. */
        'glow-lg': '0 0 0 1px rgb(var(--accent) / 0.3), 0 0 28px -4px rgb(var(--accent) / 0.35), 0 18px 60px -18px rgb(var(--accent) / 0.55)',
        /** Cyan variant, for progress and data affordances. */
        'glow-cyan': '0 0 0 1px rgb(var(--accent-2) / 0.25), 0 8px 30px -12px rgb(var(--accent-2) / 0.45)',
        /** The specular top edge that makes a panel read as glass. */
        bevel: 'inset 0 1px 0 0 rgb(var(--glass-edge) / 0.1)',
      },
      spacing: {
        sidebar: '15.5rem',
        /** Wider rail on very large screens, where 15rem looks starved. */
        'sidebar-lg': '17.5rem',
        /** 18px. Used for icons between h-4 and h-5; absent from Tailwind's scale,
         *  so 'h-4.5' was silently producing no height at all. */
        4.5: '1.125rem',
        /** WCAG 2.5.8 minimum target size. */
        touch: '2.75rem',
        /** Height of the mobile tab bar, so content can clear it. */
        tabbar: '4rem',
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
        content: '80rem',
      },
      minHeight: { touch: '2.75rem' },
      minWidth: { touch: '2.75rem' },
      blur: { glass: 'var(--glass-blur)' },
      transitionTimingFunction: {
        /** The house easing. Fast out, long settle — reads as physical. */
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
        spring: 'cubic-bezier(0.34, 1.36, 0.64, 1)',
        /** For something arriving from depth: slow start, decisive landing. */
        depth: 'cubic-bezier(0.33, 0, 0.1, 1)',
      },
      keyframes: {
        'slide-up': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'none' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'none' } },
        /**
         * Arrival from depth.
         *
         * The signature entrance: content rises *out of* the void rather than
         * sliding in from an edge, which is what makes the z-axis feel real
         * instead of decorative.
         */
        'rise-in': {
          from: { opacity: 0, transform: 'perspective(900px) translate3d(0, 14px, -80px) rotateX(6deg)' },
          to: { opacity: 1, transform: 'perspective(900px) translate3d(0, 0, 0) rotateX(0deg)' },
        },
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
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.4)' },
          '70%': { boxShadow: '0 0 0 10px rgb(var(--accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0)' },
        },
        /** A highlight travelling down the orbit rail while a plan builds. */
        'spine-travel': {
          '0%': { transform: 'translateY(-120%)' },
          '100%': { transform: 'translateY(420%)' },
        },
        /** Slow orbital rotation. Rings counter-rotate by using a negative delay. */
        'orbit-spin': {
          from: { transform: 'translate(-50%, -50%) rotate(0deg)' },
          to: { transform: 'translate(-50%, -50%) rotate(360deg)' },
        },
        /** Weightless drift, for objects meant to read as suspended. */
        float: {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '50%': { transform: 'translateY(-8px) rotate(0.6deg)' },
        },
        /** Breathing glow on the live element. */
        'glow-breathe': {
          '0%, 100%': { opacity: '0.45' },
          '50%': { opacity: '1' },
        },
        /** A light travelling along a horizontal rule — used under section heads. */
        'scan-x': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(320%)' },
        },
        /** Counts a ring's stroke into place on first paint. */
        'ring-draw': {
          from: { strokeDashoffset: 'var(--ring-circumference, 100)' },
          to: { strokeDashoffset: 'var(--ring-offset-target, 0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in-left': 'slide-in-left 0.24s cubic-bezier(0.16,1,0.3,1) both',
        'rise-in': 'rise-in 0.55s cubic-bezier(0.33,0,0.1,1) both',
        'accordion-down': 'accordion-down 0.24s cubic-bezier(0.16,1,0.3,1)',
        'accordion-up': 'accordion-up 0.2s cubic-bezier(0.16,1,0.3,1)',
        'pulse-ring': 'pulse_ring 2.2s ease-out infinite',
        'spine-travel': 'spine-travel 2.6s ease-in-out infinite',
        'orbit-slow': 'orbit-spin 48s linear infinite',
        'orbit-mid': 'orbit-spin 32s linear infinite reverse',
        'orbit-fast': 'orbit-spin 18s linear infinite',
        float: 'float 7s ease-in-out infinite',
        'glow-breathe': 'glow-breathe 3.5s ease-in-out infinite',
        'scan-x': 'scan-x 3.2s cubic-bezier(0.45,0,0.55,1) infinite',
        'ring-draw': 'ring-draw 1.1s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),

    /**
     * 3D transform utilities.
     *
     * Tailwind v3 ships no `perspective`, `transform-style` or `translateZ`
     * scale, so a depth-based design either writes arbitrary `[transform:…]`
     * everywhere — losing responsive and state variants — or adds them here
     * once. These generate as real utilities, so `md:perspective-1200` and
     * `hover:translate-z-6` both work.
     */
    plugin(({ matchUtilities, addUtilities, theme }) => {
      matchUtilities(
        {
          perspective: (value) => ({ perspective: value }),
        },
        {
          values: {
            none: 'none',
            400: '400px',
            600: '600px',
            900: '900px',
            1200: '1200px',
            1800: '1800px',
          },
        },
      );

      // translateZ takes a length, so it draws on the spacing scale.
      matchUtilities(
        {
          'translate-z': (value) => ({ transform: `translateZ(${value})` }),
        },
        { values: theme('spacing') },
      );

      // rotateX/Y take an angle, so they need their own scale — running them
      // off `spacing` would generate `rotate-x-4 { rotateX(1rem) }`, which is
      // silently invalid.
      matchUtilities(
        {
          'rotate-x': (value) => ({ transform: `rotateX(${value})` }),
          'rotate-y': (value) => ({ transform: `rotateY(${value})` }),
        },
        {
          values: {
            0: '0deg',
            1: '1deg',
            2: '2deg',
            3: '3deg',
            6: '6deg',
            12: '12deg',
            45: '45deg',
            90: '90deg',
            180: '180deg',
            '-1': '-1deg',
            '-2': '-2deg',
            '-3': '-3deg',
            '-6': '-6deg',
            '-12': '-12deg',
          },
        },
      );

      addUtilities({
        '.perspective-origin-top': { perspectiveOrigin: 'top' },
        '.perspective-origin-bottom': { perspectiveOrigin: 'bottom' },
        '.transform-3d': { transformStyle: 'preserve-3d' },
        '.transform-flat': { transformStyle: 'flat' },
      });
    }),
  ],
};
