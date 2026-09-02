'use client';

import * as React from 'react';
import { LogOut, User as UserIcon, Loader2 } from 'lucide-react';
import { supabaseBrowser } from '../lib/supabase/client';
import { cn } from '../lib/utils';

export function UserMenu({
  name,
  email,
  avatarUrl,
}: {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [signingOut, setSigningOut] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // `pointerdown` also covers touch, which `mousedown` alone misses on some
    // mobile browsers — the menu then stayed open behind the next tap.
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /**
   * Clear the session on both sides.
   *
   * The browser client can only remove the cookies JavaScript can see, so a
   * client-only sign-out can leave the httpOnly refresh cookie in place and
   * the server still considers the learner signed in — sign-out appears to do
   * nothing. The route handler does the authoritative clear; the local call
   * keeps the in-memory client consistent.
   */
  const signOut = async () => {
    setSigningOut(true);
    try {
      await supabaseBrowser().auth.signOut({ scope: 'local' });
    } catch {
      // Already gone locally — the server call below is what matters.
    }
    try {
      await fetch('/auth/signout', { method: 'POST', redirect: 'manual' });
    } catch {
      // Offline. Fall through to the navigation so the UI does not hang.
    }
    // A hard navigation, so no stale server-rendered page survives sign-out.
    window.location.href = '/';
  };

  const initials = (name ?? email ?? 'A')
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={cn(
          'flex h-9 w-9 items-center justify-center overflow-hidden rounded-full',
          'bg-surface-3 text-2xs font-semibold text-ink-muted',
          'ring-2 ring-transparent transition-all hover:ring-accent/30',
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          initials || <UserIcon className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'surface-raised absolute right-0 top-11 z-50 overflow-hidden rounded-xl animate-scale-in',
            // Never wider than the viewport on a 320px phone.
            'w-[min(14rem,calc(100vw-2rem))]',
          )}
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-sm font-medium">{name ?? 'Learner'}</p>
            {email && <p className="truncate text-xs text-ink-muted">{email}</p>}
          </div>
          <button
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="flex min-h-touch w-full items-center gap-2.5 px-3.5 py-3 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
          >
            {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
