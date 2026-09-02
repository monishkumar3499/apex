'use client';

import { useState } from 'react';
import { Mail, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabaseBrowser, supabaseConfigured } from '../../lib/supabase/client';
import { Button } from '../../components/ui';

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

/**
 * `next` and `initialError` arrive as props from the server component rather
 * than from `useSearchParams`.
 *
 * That hook opts the whole subtree out of prerendering, so the login form had to
 * sit behind a Suspense boundary and the page's static HTML contained an empty
 * box. The learner saw a blank panel until hydration — and a sign-in error
 * redirected here was invisible for that whole window. Reading the query on the
 * server means the form and the error are in the first paint.
 */
export function LoginForm({ next, initialError }: { next: string; initialError: string | null }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  // Built inside the handler, not at render: during SSR `window` does not
  // exist, and a redirectTo of `undefined` sends the learner to the Supabase
  // project's default URL instead of back here.
  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const configured = supabaseConfigured();

  const signInWithEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading('email');
    setError(null);

    try {
      const { error } = await supabaseBrowser().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: callbackUrl() },
      });
      if (error) setError(error.message);
      else setSent(true);
    } catch (thrown) {
      setError((thrown as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const signInWithGoogle = async () => {
    setLoading('google');
    setError(null);

    try {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl(),
          // Force the account chooser: without it a learner with several Google
          // accounts is silently signed into whichever one the browser last
          // used, with no way to switch.
          queryParams: { prompt: 'select_account' },
        },
      });
      if (error) {
        setError(error.message);
        setLoading(null);
      }
      // On success the browser navigates away — leave the spinner running.
    } catch (thrown) {
      setError((thrown as Error).message);
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
          We sent a sign-in link to <span className="break-all font-medium text-ink">{email}</span>. It
          expires in an hour.
        </p>
        <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-ink-faint">
          Open it in this browser — the link is tied to the session that requested it.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-6 min-h-touch text-sm font-medium text-accent hover:underline"
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

      {!configured && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-sm leading-relaxed text-danger"
        >
          This build is missing its public Supabase credentials, so sign-in cannot run. They are
          inlined at build time — pass them as Docker build args.
        </p>
      )}

      <Button
        variant="secondary"
        size="lg"
        className="mt-8 w-full"
        onClick={signInWithGoogle}
        loading={loading === 'google'}
        disabled={!configured || loading !== null}
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
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50 sm:text-sm"
          />
        </div>
        <Button
          type="submit"
          size="lg"
          className="w-full"
          loading={loading === 'email'}
          disabled={!configured || !email.trim() || loading !== null}
        >
          Email me a sign-in link
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 flex gap-2 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-sm leading-relaxed text-danger"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
        No passwords. We only use your email to sign you in and save your plans.
      </p>
    </>
  );
}
