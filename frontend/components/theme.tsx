'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';
import { Hint } from './ui/tooltip';

type Theme = 'dark' | 'light';
const STORAGE_KEY = 'apex-theme';

const ThemeContext = React.createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});

export const useTheme = () => React.useContext(ThemeContext);

/**
 * Blocking script that applies the stored theme before first paint.
 * Without this the app flashes light on every load for dark-mode users.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>('dark');

  React.useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = React.useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* private mode */ }
      return next;
    });
  }, []);

  const value = React.useMemo(() => ({ theme, toggle }), [theme, toggle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;

  return (
    <Hint label={label}>
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        className={cn(
          'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-field text-ink-muted',
          'outline-none transition-colors hover:bg-surface-2 hover:text-ink',
          'focus-visible:ring-2 focus-visible:ring-accent/60',
          className,
        )}
      >
        {/*
          Both glyphs are rendered and cross-faded rather than swapped. A
          conditional swap remounts the icon, so the button visibly flickers
          on every toggle — the one interaction where that is most obvious.
        */}
        <span className="relative block h-4 w-4">
          <Sun
            className={cn(
              'absolute inset-0 h-4 w-4 transition-all duration-300 ease-out',
              theme === 'dark' ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0',
            )}
          />
          <Moon
            className={cn(
              'absolute inset-0 h-4 w-4 transition-all duration-300 ease-out',
              theme === 'dark' ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100',
            )}
          />
        </span>
      </button>
    </Hint>
  );
}
