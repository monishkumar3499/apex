'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Compass, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabaseBrowser } from '../../lib/supabase/client';
import { Button } from '../../components/ui';
import { ThemeToggle } from '../../components/theme';

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const next = params.get('next') ?? '/app';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
      : undefined;

  const signInWithEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading('email');
    setError(null);

    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });

    if (error) setError(error.message);
    else setSent(true);
    setLoading(null);
  };

  const signInWithGoogle = async () => {
    setLoading('google');
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-success/12 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="font-display text-xl font-semibold">Check your inbox</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">
          We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. It expires in an hour.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-6 text-sm font-medium text-accent hover:underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 text-sm text-ink-muted">Pick up your prep where you left off.</p>
      </div>

      <Button
        variant="secondary"
        size="lg"
        className="mt-8 w-full"
        onClick={signInWithGoogle}
        loading={loading === 'google'}
      >
        {loading !== 'google' && <GoogleMark />}
        Continue with Google
      </Button>

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-line" />
        <span className="text-2xs font-medium uppercase tracking-wider text-ink-faint">or</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={signInWithEmail} className="space-y-3">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-sm outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50"
          />
        </div>
        <Button type="submit" size="lg" className="w-full" loading={loading === 'email'} disabled={!email.trim()}>
          Email me a sign-in link
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {error && (
        <p className="mt-4 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
        No passwords. We only use your email to sign you in and save your plans.
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgb(var(--accent)/0.10),transparent_70%)]"
      />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between p-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Compass className="h-4.5 w-4.5" strokeWidth={2.5} />
          </div>
          <span className="font-display text-base font-semibold tracking-tight">APEX</span>
        </Link>
        <ThemeToggle />
      </header>

      <div className="surface-raised relative w-full max-w-sm rounded-panel p-8 animate-in">
        <Suspense fallback={<div className="h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
