import Link from 'next/link';
import { Compass } from 'lucide-react';
import { safeNext } from '../../lib/auth-url';
import { ThemeToggle } from '../../components/theme';
import { LoginForm } from './login-form';

/**
 * Server component, so the query string is read on the server.
 *
 * The client version used `useSearchParams`, which opts its subtree out of
 * prerendering: the form had to sit behind a Suspense boundary and the page
 * shipped an empty panel that only filled in after hydration. Worse, an error
 * redirected here from `/auth/callback` was invisible for that whole window —
 * so a failed sign-in looked like a dead button.
 */
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const next = safeNext(first(params.next));
  const error = first(params.error)?.trim() || null;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgb(var(--accent)/0.10),transparent_70%)]"
      />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-safe sm:p-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Compass className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">APEX</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="surface-raised relative w-full max-w-sm rounded-panel p-6 animate-in sm:p-8">
        <LoginForm next={next} initialError={error} />
      </div>
    </main>
  );
}
