'use client';

import * as React from 'react';
import Link from 'next/link';
import { Compass, ArrowRight, Menu } from 'lucide-react';
import { ThemeToggle } from './theme';
import {
  Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose,
} from './ui';
import { cn } from '../lib/utils';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#surfaces', label: 'The app' },
  { href: '#why', label: 'Why it holds up' },
];

export function LandingNav() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  /**
   * The header only grows a border once the page has moved.
   *
   * At the top it sits flush on the hero's gradient; a hairline there cuts the
   * gradient in half for no reason. `passive` because this listener must never
   * be able to delay a scroll.
   */
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 pt-safe transition-all duration-300',
        scrolled ? 'border-b border-line/70 bg-bg/85 backdrop-blur-xl' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between gap-3 px-4 sm:h-16 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="-my-2 flex min-h-touch shrink-0 items-center gap-2.5 rounded-lg py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg sm:h-8 sm:w-8">
            <Compass className="h-4 w-4 sm:h-4.5 sm:w-4.5" strokeWidth={2.5} />
          </span>
          <span className="font-display text-base font-semibold tracking-tight">APEX</span>
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-7 text-sm text-ink-muted md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <ThemeToggle />

          <Button asChild size="sm" className="h-9 px-3 text-xs sm:h-10 sm:px-4 sm:text-sm">
            <Link href="/app">
              Start free
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <button
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-field text-ink-muted outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-surface-3 md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <SheetContent side="right" className="md:hidden">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>

              <nav aria-label="Sections" className="flex flex-col gap-2 p-4">
                {LINKS.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <a
                      href={link.href}
                      className="flex min-h-touch items-center rounded-xl border border-line bg-surface-2 px-4 py-3 text-base font-medium text-ink outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      {link.label}
                    </a>
                  </SheetClose>
                ))}
              </nav>

              <div className="mt-auto p-4 pb-safe">
                <SheetClose asChild>
                  <Button asChild size="lg" className="w-full">
                    <Link href="/app/new">
                      Build my prep map
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
