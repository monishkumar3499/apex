'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight, Menu } from 'lucide-react';
import { ThemeToggle } from './theme';
import {
  Button, KairoLogo, Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose,
} from './ui';
import { cn } from '../lib/utils';

const LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#surfaces', label: 'The app' },
  { href: '#reschedule', label: 'Rescheduling' },
  { href: '#why', label: 'Why it holds up' },
];

export function LandingNav() {
  const [open, setOpen] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);

  /**
   * The header only becomes glass once the page has moved.
   *
   * At the top it sits flush on the hero's aurora; frosting it there would blur
   * the very gradient the hero is built around, and a hairline would cut it in
   * half. `passive` because this listener must never be able to delay a scroll.
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
        'sticky top-0 z-40 pt-safe transition-all duration-500 ease-out',
        scrolled
          ? 'border-b border-glass-edge/[0.07] bg-bg/70 backdrop-blur-2xl'
          : 'border-b border-transparent',
      )}
    >
      {/* An iridescent hairline under the bar, revealed only once it frosts. */}
      <div
        aria-hidden
        className={cn(
          'holo-rule absolute inset-x-0 bottom-0 transition-opacity duration-500',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />

      <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Kairo home"
          className="-my-2 flex min-h-touch shrink-0 items-center rounded-xl py-2 outline-none transition-transform duration-300 ease-out focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg pointer:hover:scale-[1.02]"
        >
          <KairoLogo size="sm" id="nav" />
        </Link>

        <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-field px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-glass/[0.06] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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
              className="flex h-10 w-10 items-center justify-center rounded-field text-ink-muted outline-none transition-colors hover:bg-glass/[0.08] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-glass/[0.12] md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <SheetContent side="right" className="md:hidden">
              <SheetHeader>
                <SheetTitle>
                  <KairoLogo size="sm" id="sheet" />
                </SheetTitle>
              </SheetHeader>

              <nav aria-label="Sections" className="flex flex-col gap-2 p-4">
                {LINKS.map((link, i) => (
                  <SheetClose asChild key={link.href}>
                    <a
                      href={link.href}
                      // Staggered so the panel's contents arrive as a sequence
                      // rather than as one block, which is what makes a sheet
                      // feel like it opened rather than appeared.
                      style={{ animationDelay: `${60 + i * 45}ms` }}
                      className="glass flex min-h-touch animate-rise-in items-center justify-between rounded-card px-4 py-3.5 text-base font-medium text-ink outline-none transition-colors hover:border-accent/40 focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      {link.label}
                      <ArrowRight className="h-4 w-4 text-ink-faint" />
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
