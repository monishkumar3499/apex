import Link from 'next/link';
import { safeNext } from '../../lib/auth-url';
import { ThemeToggle } from '../../components/theme';
import { FadeIn, KairoLogo, OrbitRings, Void } from '../../components/ui';
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
    <main
      id="main"
      // `py-24` clears the absolutely positioned header. On a short landscape
      // viewport the whole thing scrolls rather than the panel being clipped.
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-24"
    >
      <Void variant="focus" />

      {/*
        Orbit rings centred on the panel, not on the viewport.

        The CSS variant rather than the canvas one: this page exists to be
        passed through in two seconds, and starting a requestAnimationFrame
        loop for that is not a trade worth making.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(640px,180%)] -translate-x-1/2 -translate-y-1/2 opacity-70"
      >
        <OrbitRings count={4} lit={2} />
      </div>

      <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4 pt-safe sm:p-5">
        <Link
          href="/"
          aria-label="Kairo home"
          className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-4 focus-visible:ring-offset-bg"
        >
          <KairoLogo size="sm" id="login" />
        </Link>
        <ThemeToggle />
      </header>

      <FadeIn className="relative w-full max-w-sm">
        {/* Bloom under the panel, so the one interactive thing on the page is
            also the brightest. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-8 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,rgb(var(--accent)/0.18),transparent_70%)] blur-2xl"
        />

        <div className="glass-raised relative rounded-panel p-6 shadow-e4 sm:p-8">
          <div className="holo-rule absolute inset-x-0 top-0 rounded-t-panel" />
          <LoginForm next={next} initialError={error} />
        </div>
      </FadeIn>
    </main>
  );
}
