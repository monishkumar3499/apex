import type { Metadata, Viewport } from 'next';
import { Outfit, Inter, JetBrains_Mono, Newsreader } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { ThemeProvider, themeScript } from '../components/theme';
import { MotionProvider } from '../components/ui/motion';
import { TooltipProvider } from '../components/ui/tooltip';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

/**
 * A real monospace, for the one job Inter cannot do.
 *
 * Every number in Kairo changes — day 24 of 180, 2h 40m remaining, a 12-day
 * streak — and a proportional font reflows the layout on each tick. Inter's
 * `tabular-nums` fixes the width but not the *character*: a schedule reads as
 * instrumentation, and instrument readouts are monospaced. Loaded at two
 * weights only, so this costs about 15KB.
 */
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '600'],
  variable: '--font-mono',
  display: 'swap',
});

/**
 * The reading face, for prose the learner is trying to *learn from*.
 *
 * Inter is an excellent interface font and a mediocre reading one — it is
 * optimised for labels, buttons and dense data, which is why it is still what
 * every control in this app uses. But the app also contains real prose: a
 * coach answer runs to 300 words, a topic summary explains a concept, an
 * outcome states what you should be able to do. Setting those in a UI sans at
 * 14px is the single biggest thing that made the workspace feel like a
 * dashboard rather than like study material.
 *
 * Newsreader is a screen-first serif with a large x-height and open
 * counters — it holds up at 15px on a phone, which most serifs do not. Loaded
 * at two weights and italic only; the italic matters because prose actually
 * uses emphasis, unlike UI copy.
 */
const reading = Newsreader({
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-reading',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Kairo — every hour you have, placed',
    template: '%s · Kairo',
  },
  description:
    'Tell Kairo what you are preparing for and by when. It finds the best real resources, then builds a day-by-day study map that fits the hours you actually have.',
  applicationName: 'Kairo',
  openGraph: {
    title: 'Kairo — every hour you have, placed',
    description: 'An AI prep engine that turns any goal into an executable, day-by-day study map.',
    siteName: 'Kairo',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kairo — every hour you have, placed',
    description: 'An AI prep engine that turns any goal into an executable, day-by-day study map.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately NOT `maximumScale: 1` / `userScalable: false`. Locking zoom is
  // the usual way a "mobile-optimised" app becomes unusable for anyone who
  // needs to magnify text, and it fails WCAG 1.4.4.
  viewportFit: 'cover',
  // Keeps a fixed bottom bar above the on-screen keyboard instead of being
  // pushed off-screen by it.
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#07070f' },
    { media: '(prefers-color-scheme: light)', color: '#f7f7fb' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${outfit.variable} ${inter.variable} ${mono.variable} ${reading.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        {/*
          A skip link is the cheapest real accessibility win available: without
          it, a keyboard user landing on the plan workspace tabs through the
          entire sidebar on every navigation before reaching the content.
        */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-accent-fg focus:shadow-glow-lg"
        >
          Skip to content
        </a>

        <ThemeProvider>
          <MotionProvider>
            {/*
              `delayDuration` is long enough that a pointer crossing the screen
              does not trail a wake of tooltips behind it.
            */}
            <TooltipProvider delayDuration={350} skipDelayDuration={200}>
              {children}
              <Toaster
                position="bottom-center"
                // Toasts must clear the mobile tab bar and the home indicator,
                // or the confirmation of the thing you just did covers the
                // navigation you would use next.
                offset={16}
                mobileOffset={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
                toastOptions={{
                  className: 'glass-raised !rounded-xl !text-sm !backdrop-blur-xl',
                  style: {
                    // Sonner writes inline styles, so these have to be inline
                    // to win — a class would lose to its own defaults.
                    background: 'rgb(var(--surface) / 0.9)',
                    color: 'rgb(var(--text))',
                    border: '1px solid rgb(var(--glass-edge) / 0.12)',
                    boxShadow: '0 24px 60px -18px rgb(var(--shadow-color) / 0.5)',
                  },
                }}
              />
            </TooltipProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
