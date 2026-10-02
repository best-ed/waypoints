const CREDIT_TEXT = 'Search by OpenStreetMap Nominatim';
const NO_RESULTS_TEXT = 'No places found';
const NO_RESULTS_HINT =
  'Check the spelling or try a broader name, like a neighbourhood or city.';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

/* Every string reaching this module came from Nominatim, so all of it goes in through
   textContent. Nothing here builds markup from a response. */
export function createPlaceSearchControl({ map, onSearch, onChoose, onClear }) {
  const container = L.DomUtil.create('div', 'leaflet-control place-search');
  const form = element('form', 'place-search-form');
  const input = element('input', 'place-search-input');
  const submit = element('button', 'button place-search-submit', 'Search');
  const status = element('p', 'place-search-status');
  const hint = element('p', 'place-search-hint', NO_RESULTS_HINT);
  const list = element('ul', 'place-search-results');
  const credit = element('p', 'place-search-credit', CREDIT_TEXT);

  let results = [];
  let activeIndex = -1;

  input.type = 'search';
  input.placeholder = 'Search places';
  input.setAttribute('aria-label', 'Search for a place');
  input.autocomplete = 'off';
  submit.type = 'submit';
  status.hidden = true;
  hint.hidden = true;
  list.hidden = true;
  credit.hidden = true;

  form.append(input, submit);
  container.append(form, status, hint, list, credit);

  /* Without this the map pans under a drag on the control and zooms on a scroll over it. */
  L.DomEvent.disableClickPropagation(container);
  L.DomEvent.disableScrollPropagation(container);

  /* The hint belongs to the no-results case only, so it is cleared here rather than at each
     call site: an error message must not inherit advice about spelling. */
  function setStatus(message) {
    status.textContent = message;
    status.hidden = message === '';
    hint.hidden = true;
  }

  function showNoResults() {
    setStatus(NO_RESULTS_TEXT);
    hint.hidden = false;
  }

  function highlight(index) {
    activeIndex = index;

    [...list.children].forEach((item, position) => {
      const button = item.firstChild;
      const isActive = position === index;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
      if (isActive) {
        button.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function closeResults() {
    results = [];
    activeIndex = -1;
    list.replaceChildren();
    list.hidden = true;
    credit.hidden = true;
  }

  function choose(index) {
    const result = results[index];
    if (result) {
      closeResults();
      setStatus('');
      onChoose(result);
    }
  }

  function showResults(nextResults) {
    results = nextResults;
    activeIndex = -1;
    list.replaceChildren();

    if (results.length === 0) {
      list.hidden = true;
      credit.hidden = true;
      showNoResults();
      return;
    }

    results.forEach((result, index) => {
      const item = element('li', 'place-search-result');
      const button = element('button', 'place-search-result-button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');

      button.append(element('span', 'place-search-name', result.name));
      button.append(element('span', 'place-search-detail', result.displayName));

      button.addEventListener('click', () => choose(index));
      item.append(button);
      list.append(item);
    });

    list.hidden = false;
    credit.hidden = false;
    setStatus('');
  }

  function step(offset) {
    if (results.length === 0) {
      return;
    }
    const next = activeIndex < 0 && offset < 0 ? results.length - 1 : activeIndex + offset;
    highlight((next + results.length) % results.length);
  }

  /* Submit only. There is no input listener that fires a request, which is the whole
     point: Nominatim's policy forbids search-as-you-type. */
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query === '') {
      return;
    }
    closeResults();
    setStatus('Searching...');
    onSearch(query);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      step(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      step(-1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      closeResults();
      setStatus('');
      onClear();
    }
  });

  const control = L.control({ position: 'topleft' });
  control.onAdd = () => container;
  control.addTo(map);

  return {
    showResults,
    setStatus,
    closeResults,
    showError: (message) => {
      closeResults();
      setStatus(message);
    },
    focus: () => input.focus(),
    getQuery: () => input.value.trim()
  };
}
