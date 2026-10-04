export const THEMES = Object.freeze(['system', 'light', 'dark']);

const DARK_QUERY = '(prefers-color-scheme: dark)';

export function isTheme(value) {
  return THEMES.includes(value);
}

/* "system" is expressed as the absence of the attribute, which is what lets the media query in
   tokens.css decide. Setting data-theme="system" would match neither override selector and
   quietly do nothing, so it is removed instead. */
export function applyTheme(theme, element = document.documentElement) {
  if (theme === 'light' || theme === 'dark') {
    element.setAttribute('data-theme', theme);
    return;
  }

  element.removeAttribute('data-theme');
}

/* What the page is actually showing, which is what the basemap needs to know. */
export function effectiveTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    return theme;
  }

  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/* Fires when the system preference changes, so a session left on "system" follows the OS
   without a reload. */
export function watchSystemTheme(listener) {
  const query = window.matchMedia(DARK_QUERY);
  const handler = () => listener(query.matches ? 'dark' : 'light');

  query.addEventListener('change', handler);

  return () => query.removeEventListener('change', handler);
}
