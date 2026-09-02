'use client';

import * as React from 'react';
import Link from 'next/link';
import { Compass, ArrowRight, Menu, X } from 'lucide-react';
import { ThemeToggle } from './theme';

export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-3.5 sm:h-16 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg sm:h-8 sm:w-8">
            <Compass className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">APEX</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-7 text-sm text-ink-muted md:flex">
          <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          <a href="#surfaces" className="transition-colors hover:text-ink">The app</a>
          <a href="#why" className="transition-colors hover:text-ink">Why it holds up</a>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link
            href="/app"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-accent px-3 text-xs font-medium text-accent-fg shadow-sm transition-all hover:bg-accent-hover sm:h-10 sm:px-4 sm:text-sm"
          >
            <span>Start free</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink active:bg-surface-3 md:hidden"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown / Sheet */}
      {mobileMenuOpen && (
        <div className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] bottom-0 z-50 flex flex-col bg-bg/95 p-5 backdrop-blur-2xl animate-in md:hidden">
          <nav className="flex flex-col gap-2 pt-2 text-base font-medium">
            <a
              href="#how"
              onClick={closeMenu}
              className="flex min-h-touch items-center rounded-xl border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-accent/40"
            >
              How it works
            </a>
            <a
              href="#surfaces"
              onClick={closeMenu}
              className="flex min-h-touch items-center rounded-xl border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-accent/40"
            >
              The app
            </a>
            <a
              href="#why"
              onClick={closeMenu}
              className="flex min-h-touch items-center rounded-xl border border-line bg-surface px-4 py-3 text-ink transition-colors hover:border-accent/40"
            >
              Why it holds up
            </a>
          </nav>

          <div className="mt-auto pb-safe pt-6">
            <Link
              href="/app/new"
              onClick={closeMenu}
              className="flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-medium text-accent-fg shadow-sm transition-all hover:bg-accent-hover"
            >
              <span>Build my prep map</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
