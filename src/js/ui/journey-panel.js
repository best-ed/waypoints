/* One memory is a dot, not a journey. */
export const MIN_JOURNEY_STOPS = 2;

/* All the sidebar keeps of journey mode: the way in, and the reason it is unavailable when it
   is. The transport and the readout live on the map now, where the journey is. */
export function createJourneyPanel({ containerElement, toggleElement, hintElement, onToggle }) {
  /* aria-disabled rather than the disabled attribute: a disabled button leaves the tab order,
     which would put the explanation of why it is unavailable out of reach of anyone using a
     keyboard or a screen reader. The click handler enforces it instead. */
  function setAvailable(available) {
    toggleElement.setAttribute('aria-disabled', String(!available));
    toggleElement.classList.toggle('is-disabled', !available);
  }

  function render({ summary, isActive, total = Infinity }) {
    const enoughStops = summary.count >= MIN_JOURNEY_STOPS;
    /* With fewer than two memories in the whole library there is nothing a journey could ever
       be, so the control is not shown at all rather than shown unavailable with a reason. The
       reason only helps once the feature is reachable. */
    const possible = total >= MIN_JOURNEY_STOPS;

    containerElement.hidden = !possible;

    if (!possible) {
      return;
    }

    setAvailable(enoughStops || isActive);
    toggleElement.setAttribute('aria-pressed', String(isActive));
    /* The label, not the button: it carries an icon, and setting textContent on it would
       take the icon with the old words. */
    const label = toggleElement.querySelector('.button-label') ?? toggleElement;
    label.textContent = isActive ? 'Exit journey' : 'Journey';

    hintElement.hidden = enoughStops || isActive;
  }

  toggleElement.addEventListener('click', () => {
    if (toggleElement.getAttribute('aria-disabled') === 'true') {
      return;
    }
    onToggle();
  });

  return { render, focus: () => toggleElement.focus() };
}
