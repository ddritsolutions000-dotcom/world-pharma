'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { renderThemeCss, type ColorMode } from '../tokens';
import './styles.css';

export type ThemePreference = ColorMode | 'system';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ColorMode;
  setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function resolvePreference(pref: ThemePreference): ColorMode {
  if (pref !== 'system') {
    return pref;
  }
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeStyleTag(): React.JSX.Element {
  return <style id="wp-theme" dangerouslySetInnerHTML={{ __html: renderThemeCss() }} />;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
}: {
  children: ReactNode;
  defaultTheme?: ThemePreference;
}): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(defaultTheme);
  const [resolved, setResolved] = useState<ColorMode>(() => resolvePreference(defaultTheme));

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setResolved(resolvePreference(next));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (preference === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', preference);
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (preference === 'system') {
        setResolved(media.matches ? 'dark' : 'light');
      }
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ThemeStyleTag />
      <div className="wp-root">{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
