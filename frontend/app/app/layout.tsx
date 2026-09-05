import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser } from '../../lib/supabase/server';
import { ThemeToggle } from '../../components/theme';
import { UserMenu } from '../../components/user-menu';
import { KairoLogo, Void } from '../../components/ui';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/app');

  return (
    <div className="relative min-h-dvh">
      {/*
        `fixed`, not `absolute`. The plan list scrolls, and an absolutely
        positioned void would scroll with it — so the aurora would slide off
        the top of a long list and the page would end on flat black.
      */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <Void variant="ambient" />
      </div>

      <header className="sticky top-0 z-40 border-b border-glass-edge/[0.06] bg-bg/70 pt-safe backdrop-blur-2xl">
        <div className="holo-rule absolute inset-x-0 bottom-0 opacity-60" />

        <div className="mx-auto flex h-16 w-full max-w-content items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/app"
            aria-label="Your plans"
            className="-my-2 flex min-h-touch items-center rounded-xl py-2 outline-none transition-transform duration-300 ease-out focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg pointer:hover:scale-[1.02]"
          >
            <KairoLogo size="sm" id="app" />
          </Link>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>

      {/*
        `max-w-content` (80rem) rather than 6xl: on a 34" monitor the old
        72rem column left the plan grid capped at three cards with a third of
        the screen empty either side. The px steps grow with the breakpoint so
        the gutter stays proportional instead of pinning at 20px.
      */}
      <main
        id="main"
        className="relative mx-auto w-full max-w-content px-4 py-8 pb-24 sm:px-6 sm:py-12 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
