/* How thick the journey line is drawn, which cannot be a token because it answers a question
   the stylesheet cannot see: how far out the map is.

   A three pixel stroke is right over a city and far too heavy over a continent, where
   fifty-nine legs at three pixels stop being lines and become a band. The weight thins with the
   zoom; the stylesheet still owns the stroke, through a custom property this feeds. */

export const MIN_LINE_WEIGHT = 1.25;
export const MAX_LINE_WEIGHT = 3.5;

/* Between these two the weight moves; outside them it sits at an end. Chosen against the low
   zoom screenshots: 3 is about where a worldwide journey stops reading as separate legs, and
   by 11 a single leg fills the view and deserves the full stroke. */
export const THINNEST_AT_ZOOM = 3;
export const THICKEST_AT_ZOOM = 11;

/* Rounded, so a pan that nudges the zoom fraction does not rewrite the attribute each frame. */
const DECIMALS = 2;

export function weightForZoom(zoom) {
  if (!Number.isFinite(zoom)) {
    return MAX_LINE_WEIGHT;
  }

  const span = THICKEST_AT_ZOOM - THINNEST_AT_ZOOM;
  const progress = Math.min(1, Math.max(0, (zoom - THINNEST_AT_ZOOM) / span));
  const weight = MIN_LINE_WEIGHT + progress * (MAX_LINE_WEIGHT - MIN_LINE_WEIGHT);

  return Number(weight.toFixed(DECIMALS));
}
