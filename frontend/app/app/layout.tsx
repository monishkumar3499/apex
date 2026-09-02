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
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/85 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-5">
          <Link href="/app" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Compass className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">APEX</span>
          </Link>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <UserMenu name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-16 sm:px-5 sm:py-10">{children}</main>
    </div>
  );
}
