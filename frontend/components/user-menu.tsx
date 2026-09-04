'use client';

import * as React from 'react';
import { LogOut, Loader2, LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { supabaseBrowser } from '../lib/supabase/client';
import {
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui';
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
  const [signingOut, setSigningOut] = React.useState(false);

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Account menu"
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
            'outline-none ring-2 ring-transparent transition-all',
            'hover:ring-accent/30 focus-visible:ring-accent/60 data-[state=open]:ring-accent/40',
          )}
        >
          <Avatar src={avatarUrl} name={name} email={email} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-[min(15rem,calc(100vw-1.5rem))]">
        <DropdownMenuLabel className="flex items-center gap-2.5">
          <Avatar src={avatarUrl} name={name} email={email} className="h-8 w-8" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{name ?? 'Learner'}</span>
            {email && <span className="block truncate text-xs text-ink-muted">{email}</span>}
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/app">
            <LayoutGrid />
            All plans
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          tone="danger"
          disabled={signingOut}
          // Radix closes the menu on select by default, which would unmount
          // the item mid-request and lose the spinner.
          onSelect={(event) => {
            event.preventDefault();
            void signOut();
          }}
        >
          {signingOut ? <Loader2 className="animate-spin" /> : <LogOut />}
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
