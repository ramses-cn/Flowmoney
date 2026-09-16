export type ThemeMode = 'light' | 'dark' | 'system';

export function getSavedTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('flowmoney_theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {}
  return 'system';
}

export function applyTheme(mode: ThemeMode = 'system') {
  try {
    localStorage.setItem('flowmoney_theme', mode);
  } catch {}

  const root = document.documentElement;
  const isDark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function initThemeListener(): () => void {
  const current = getSavedTheme();
  applyTheme(current);

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (getSavedTheme() === 'system') {
      applyTheme('system');
    }
  };

  mediaQuery.addEventListener('change', handleChange);
  return () => {
    mediaQuery.removeEventListener('change', handleChange);
  };
}
