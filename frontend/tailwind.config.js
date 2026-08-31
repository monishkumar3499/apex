/** @type {import('tailwindcss').Config} */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
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
      },
      borderRadius: {
        card: '14px',
        panel: '18px',
      },
      spacing: {
        sidebar: '15rem',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'slide-up': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
        'scale-in': { from: { opacity: 0, transform: 'scale(0.97)' }, to: { opacity: 1, transform: 'none' } },
        pulse_ring: {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgb(var(--accent) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--accent) / 0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.35s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in': 'scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-ring': 'pulse_ring 2.2s ease-out infinite',
      },
    },
  },
  plugins: [],
};
