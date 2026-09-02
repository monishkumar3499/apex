import type { Metadata, Viewport } from 'next';
import { Outfit, Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import './globals.css';
import { ThemeProvider, themeScript } from '../components/theme';

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
        <ThemeProvider>
          {children}
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: 'surface-raised !rounded-xl !text-sm',
              style: {
                background: 'rgb(var(--surface))',
                color: 'rgb(var(--text))',
                border: '1px solid rgb(var(--border))',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
