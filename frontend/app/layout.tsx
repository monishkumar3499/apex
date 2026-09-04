import type { Metadata, Viewport } from 'next';
import { Outfit, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { ThemeProvider, themeScript } from '../components/theme';
import { MotionProvider } from '../components/ui/motion';
import { TooltipProvider } from '../components/ui/tooltip';

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'APEX — your prep, mapped day by day',
    template: '%s · APEX',
  },
  description:
    'Tell APEX what you are preparing for and by when. It finds the best real resources, then builds a day-by-day study map that fits the hours you actually have.',
  openGraph: {
    title: 'APEX — your prep, mapped day by day',
    description: 'An AI study engine that turns any goal into an executable prep map.',
    type: 'website',
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
    { media: '(prefers-color-scheme: dark)', color: '#090c14' },
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${inter.variable}`}>
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
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:bg-accent focus:px-4 focus:py-2.5 focus:text-sm focus:font-medium focus:text-accent-fg focus:shadow-e3"
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
                mobileOffset={{ bottom: 'calc(4.75rem + env(safe-area-inset-bottom, 0px))' }}
                toastOptions={{
                  className: 'surface-raised !rounded-xl !text-sm',
                  style: {
                    background: 'rgb(var(--surface))',
                    color: 'rgb(var(--text))',
                    border: '1px solid rgb(var(--border))',
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
