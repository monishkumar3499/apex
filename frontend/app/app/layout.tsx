import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Compass } from 'lucide-react';
import { currentUser } from '../../lib/supabase/server';
import { ThemeToggle } from '../../components/theme';
import { UserMenu } from '../../components/user-menu';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect('/login?next=/app');

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-content items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/app"
            className="-my-2 flex min-h-touch items-center gap-2.5 rounded-lg py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Compass className="h-4 w-4" strokeWidth={2.5} />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">APEX</span>
          </Link>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>

      {/*
        `max-w-content` (78rem) rather than 6xl: on a 34" monitor the old
        72rem column left the plan grid capped at three cards with a third of
        the screen empty either side. The px steps grow with the breakpoint so
        the gutter stays proportional instead of pinning at 20px.
      */}
      <main id="main" className="mx-auto w-full max-w-content px-4 py-6 pb-20 sm:px-6 sm:py-10 lg:px-8">
        {children}
      </main>
    </div>
  );
}
