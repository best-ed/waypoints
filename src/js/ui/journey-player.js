import { FINISHED, PLAYING } from '../journey/playback.js';
import { setButtonIcon } from './icons.js';

/* The journey's transport, docked to the map rather than stacked in the sidebar.

   In the sidebar it was three small buttons and the text "1 / 60", a column away from the pin
   it was talking about, and on a narrow screen not even on the same pane as the map it was
   driving. Here it sits over the bottom of the map: the stop it names is the pin that just
   moved under it. */

/* aria-disabled rather than the disabled attribute, for the reason every other stepper here
   uses it: a disabled button leaves the tab order, so stepping to the last stop would drop
   focus off the button that was just pressed. */
function setAvailable(element, available) {
  element.setAttribute('aria-disabled', String(!available));
}

function isAvailable(element) {
  return element.getAttribute('aria-disabled') !== 'true';
}

export function createJourneyPlayer({
  containerElement,
  playElement,
  previousElement,
  nextElement,
  titleElement,
  metaElement,
  positionElement,
  formatDate,
  onToggle,
  onPrevious,
  onNext
}) {
  function render({ status, index, count }, { isActive, stop = null }) {
    containerElement.hidden = !isActive || count === 0;

    if (containerElement.hidden) {
      return;
    }

    const isPlaying = status === PLAYING;

    /* The name carries the state, which is why there is no aria-pressed as well: both together
       would announce the button twice over. */
    setButtonIcon(playElement, isPlaying ? 'pause' : 'play');
    playElement.setAttribute(
      'aria-label',
      isPlaying ? 'Pause journey' : status === FINISHED ? 'Play the journey again' : 'Play journey'
    );

    setAvailable(previousElement, index > 0);
    setAvailable(nextElement, index < count - 1);

    titleElement.textContent = stop ? stop.title : '';
    metaElement.textContent = stop ? formatDate(stop.date) : '';
    positionElement.textContent = index + 1 + ' of ' + count;
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

  /* Space and Enter are left to the browser, so each button does what its name says. An
     overridden Space meant pressing it on Previous started playback, which is not what a
     button announcing itself as "Previous" should do. Stepping with the arrow keys belongs to
     the scrubber, which has them natively. */

  return { render, focusPlay: () => playElement.focus() };
}
