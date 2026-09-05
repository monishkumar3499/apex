'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';
import { Hint } from './ui/tooltip';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'kairo-theme';
/** Read once on first load, so the rename does not reset anyone's choice. */
const LEGACY_KEY = 'apex-theme';

/**
 * Whether the plan workspace rail is collapsed.
 *
 * Applied by the same blocking script as the theme, for the same reason: the
 * content column's left padding is driven by `--rail-w`, so restoring this
 * after hydration would shift the whole workspace sideways on every load.
 */
export const RAIL_KEY = 'kairo-rail';

const ThemeContext = React.createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
});

export const useTheme = () => React.useContext(ThemeContext);

/**
 * Blocking script that applies the stored theme before first paint.
 *
 * Without this the app flashes light on every load for dark-mode users — and
 * on Aurora Glass that flash is far worse than it was on the old palette,
 * because the two grounds are near-white and near-black.
 *
 * Dark is the default when nothing is stored: it is the mode this design was
 * built in, and the mode a study tool is most often opened in.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||localStorage.getItem('${LEGACY_KEY}');if(t!=='light'){document.documentElement.classList.add('dark')}}catch(e){document.documentElement.classList.add('dark')}try{if(localStorage.getItem('${RAIL_KEY}')==='mini'){document.documentElement.setAttribute('data-rail','mini')}}catch(e){}})();`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>('dark');

  React.useEffect(() => {
    setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  const toggle = React.useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.classList.toggle('dark', next === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, next);
        // Drop the pre-rename key once the new one is authoritative, so the
        // fallback read above cannot resurrect a stale preference later.
        localStorage.removeItem(LEGACY_KEY);
      } catch { /* private mode */ }
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
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-field text-ink-muted',
          'outline-none transition-all duration-300 hover:bg-glass/[0.08] hover:text-accent',
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
