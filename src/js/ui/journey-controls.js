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

  /* Space is taken over for the whole group, so it reads like any other player: whatever has
     focus, Space starts and stops. Enter still activates the focused button, and the arrows
     step, so every control keeps a keyboard path. */
  container.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      onToggle();
      return;
    }

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
