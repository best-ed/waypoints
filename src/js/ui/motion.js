const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/* Read per call rather than cached: the setting can change while the page is open. */
export function prefersReducedMotion() {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
