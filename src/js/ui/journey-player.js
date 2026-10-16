import { DEFAULT_SPEED, FINISHED, PLAYING } from '../journey/playback.js';
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

/* Past this the ticks are a grey smear rather than a scale, and a reader learns nothing from
   a mark they cannot land on. */
export const MAX_TICKS = 30;

export function createJourneyPlayer({
  containerElement,
  playElement,
  previousElement,
  nextElement,
  titleElement,
  metaElement,
  positionElement,
  scrubberElement,
  ticksElement,
  announceElement,
  speedElement,
  endElement,
  endSummaryElement,
  replayElement,
  exitElement,
  formatDate,
  onToggle,
  onPrevious,
  onNext,
  onScrub,
  onSpeed,
  onReplay,
  onExit
}) {
  let announced = '';
  let tickCount = -1;
  let wasFinished = false;

  function renderTicks(count) {
    if (count === tickCount) {
      return;
    }

    tickCount = count;
    ticksElement.replaceChildren();

    if (count > MAX_TICKS) {
      return;
    }

    for (let stop = 0; stop < count; stop++) {
      const option = document.createElement('option');
      option.value = String(stop);
      ticksElement.append(option);
    }
  }

  function render({ status, index, count }, { isActive, stop = null, summary = '' }) {
    containerElement.hidden = !isActive || count === 0;

    if (containerElement.hidden) {
      announced = '';
      wasFinished = false;
      endElement.hidden = true;
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

    renderTicks(count);

    scrubberElement.max = String(Math.max(0, count - 1));
    scrubberElement.value = String(index);

    const where = 'Stop ' + (index + 1) + ' of ' + count;
    const spoken = stop ? where + ': ' + stop.title + ', ' + formatDate(stop.date) : where;

    scrubberElement.setAttribute('aria-valuetext', spoken);

    /* Only when it actually changes. A live region written on every render would re-announce
       the stop each time the play button swapped its icon. */
    if (spoken !== announced) {
      announced = spoken;
      announceElement.textContent = spoken;
    }

    const finished = status === FINISHED;

    endElement.hidden = !finished;
    endSummaryElement.textContent = finished ? summary : '';

    /* On arriving at the end, not on every render while sitting there. Moving focus each time
       anything else changed would take the keyboard off whatever the reader had reached for. */
    if (finished && !wasFinished) {
      replayElement.focus();
    }

    wasFinished = finished;
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

  /* Left and Right step stops, which a range input already does: the handler below only has to
     act on the result. Nothing here intercepts a key, which is also why Space and Enter are
     left to the browser on each button - an overridden Space meant pressing it on Previous
     started playback, which is not what a button announcing itself as "Previous" should do. */
  scrubberElement.addEventListener('input', () => {
    const target = Number(scrubberElement.value);

    if (Number.isInteger(target)) {
      onScrub(target);
    }
  });

  /* aria-pressed rather than a radio group: these are three buttons that each do something
     immediately, not a choice that is submitted. Delegated, because the three are fixed and a
     listener each would say the same thing three times. */
  function setSpeed(chosen) {
    for (const option of speedElement.querySelectorAll('[data-speed]')) {
      option.setAttribute('aria-pressed', String(option.dataset.speed === chosen));
    }

    onSpeed(chosen);
  }

  replayElement.addEventListener('click', () => onReplay());
  exitElement.addEventListener('click', () => onExit());

  speedElement.addEventListener('click', (event) => {
    const option = event.target.closest('[data-speed]');

    if (option && option.getAttribute('aria-pressed') !== 'true') {
      setSpeed(option.dataset.speed);
    }
  });

  return {
    render,
    focusPlay: () => playElement.focus(),
    /* Leaving journey mode throws the position away, so it throws the speed away too: a speed
       is how somebody is watching one journey, not a setting they carry around. */
    resetSpeed: () => setSpeed(DEFAULT_SPEED)
  };
}
