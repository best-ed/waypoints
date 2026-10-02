import { PLAYING } from '../journey/playback.js';

/* aria-disabled rather than the disabled attribute: stepping to the last stop would otherwise
   disable the button that was just activated, and focus would fall to the body. The handlers
   below enforce it, and the playback machine treats the boundaries as no-ops anyway. */
function setAvailable(element, available) {
  element.setAttribute('aria-disabled', String(!available));
  element.classList.toggle('is-disabled', !available);
}

function isAvailable(element) {
  return element.getAttribute('aria-disabled') !== 'true';
}

export function createJourneyControls({
  container,
  playElement,
  previousElement,
  nextElement,
  progressElement,
  onToggle,
  onPrevious,
  onNext
}) {
  function render({ status, index, count }, { isActive }) {
    container.hidden = !isActive || count === 0;

    if (container.hidden) {
      progressElement.textContent = '';
      return;
    }

    const isPlaying = status === PLAYING;

    /* The name carries the state, which is why there is no aria-pressed here as well: both
       together would announce the button twice over. */
    playElement.textContent = isPlaying ? 'Pause' : 'Play';
    playElement.setAttribute('aria-label', isPlaying ? 'Pause journey' : 'Play journey');

    setAvailable(previousElement, index > 0);
    setAvailable(nextElement, index < count - 1);

    progressElement.textContent = index + 1 + ' / ' + count;
  }

  function step(handler, element) {
    if (!isAvailable(element)) {
      return;
    }
    handler();
  }

  playElement.addEventListener('click', () => onToggle());
  previousElement.addEventListener('click', () => step(onPrevious, previousElement));
  nextElement.addEventListener('click', () => step(onNext, nextElement));

  /* Space and Enter are left to the browser, so each button does what it says it does.
     Overriding Space across the group meant pressing it on Previous started playback instead,
     which is not what a button announcing itself as "Previous" should do. The arrows are the
     group-wide shortcut, and they have no native behaviour on a button to displace. */
  container.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(onPrevious, previousElement);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(onNext, nextElement);
    }
  });

  return { render, focusPlay: () => playElement.focus() };
}
