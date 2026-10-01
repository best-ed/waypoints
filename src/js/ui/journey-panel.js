import { formatJourneySummary } from '../journey/journey-summary.js';

/* One memory is a dot, not a journey. */
export const MIN_JOURNEY_STOPS = 2;

export function createJourneyPanel({ toggleElement, hintElement, summaryElement, onToggle }) {
  /* aria-disabled rather than the disabled attribute: a disabled button leaves the tab order,
     which would put the explanation of why it is unavailable out of reach of anyone using a
     keyboard or a screen reader. The click handler enforces it instead. */
  function setAvailable(available) {
    toggleElement.setAttribute('aria-disabled', String(!available));
    toggleElement.classList.toggle('is-disabled', !available);
  }

  function render({ summary, isActive }) {
    const enoughStops = summary.count >= MIN_JOURNEY_STOPS;

    setAvailable(enoughStops || isActive);
    toggleElement.setAttribute('aria-pressed', String(isActive));
    toggleElement.textContent = isActive ? 'Exit journey' : 'Journey';

    hintElement.hidden = enoughStops || isActive;

    const line = isActive ? formatJourneySummary(summary) : '';
    summaryElement.textContent = line;
    summaryElement.hidden = line === '';
  }

  toggleElement.addEventListener('click', () => {
    if (toggleElement.getAttribute('aria-disabled') === 'true') {
      return;
    }
    onToggle();
  });

  return { render, focus: () => toggleElement.focus() };
}
