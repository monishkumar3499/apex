'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, User as UserIcon } from 'lucide-react';
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
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    router.push('/');
    router.refresh();
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
        className={cn(
          'flex h-8 w-8 items-center justify-center overflow-hidden rounded-full',
          'bg-surface-3 text-2xs font-semibold text-ink-muted',
          'ring-2 ring-transparent transition-all hover:ring-accent/30',
        )}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials || <UserIcon className="h-4 w-4" />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="surface-raised absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-xl animate-scale-in"
        >
          <div className="border-b border-line px-3.5 py-3">
            <p className="truncate text-sm font-medium">{name ?? 'Learner'}</p>
            {email && <p className="truncate text-xs text-ink-muted">{email}</p>}
          </div>
          <button
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
