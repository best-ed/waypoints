import { MAX_TAGS, TAG_MAX_LENGTH } from '../data/schema.js';
import { suggestTags } from './suggest-tags.js';

/* Tags as tokens rather than a line of commas.

   The old field was a text input and the sentence "Separate tags with commas", which asks
   someone to hold the whole list in their head as a string: there was no way to see what you
   had, no way to take one off without editing around it, and no way to find out that the
   library already calls it "trail" and not "trails". The store has always normalized the
   result, so "Trail, trail , TRAIL" quietly became one tag and the field went on claiming
   there were three.

   A token shows what will be stored, which is why committing lowercases rather than keeping
   what was typed: the alternative is a field that shows "Trail" and a memory that holds
   "trail".

   The popup is the ARIA 1.2 combobox pattern: the input keeps focus throughout and
   aria-activedescendant says which option is current, because moving real focus into a
   listbox takes the keyboard away from the thing being typed into. */

const COUNT_MESSAGE = 'A memory can have ' + MAX_TAGS + ' tags at most.';
const LENGTH_MESSAGE = 'A tag can be ' + TAG_MAX_LENGTH + ' characters at most.';

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

export function createTagInput({
  inputElement,
  tokensElement,
  listboxElement,
  errorElement,
  getAllTags = () => [],
  onChange = () => {},
  createIcon = null
}) {
  let tags = [];
  let suggestions = [];
  let activeIndex = -1;

  const optionId = (index) => listboxElement.id + '-option-' + index;

  function showError(message) {
    errorElement.textContent = message ?? '';
    errorElement.hidden = !message;
    inputElement.setAttribute('aria-invalid', String(Boolean(message)));
  }

  function renderTokens() {
    tokensElement.replaceChildren();
    tokensElement.hidden = tags.length === 0;

    for (const [index, tag] of tags.entries()) {
      const item = element('li', 'chip chip-tag tag-token');
      item.append(element('span', 'tag-token-label', tag));

      const remove = element('button', 'tag-token-remove');
      remove.type = 'button';
      /* The token carries the name; this button is what acts on it, so the name says so. */
      remove.setAttribute('aria-label', 'Remove tag ' + tag);

      if (createIcon) {
        remove.append(createIcon('close', { size: 12 }));
      }

      remove.addEventListener('click', () => removeAt(index));
      item.append(remove);
      tokensElement.append(item);
    }
  }

  function closeList() {
    activeIndex = -1;
    suggestions = [];
    listboxElement.replaceChildren();
    listboxElement.hidden = true;
    inputElement.setAttribute('aria-expanded', 'false');
    inputElement.removeAttribute('aria-activedescendant');
  }

  function renderActive() {
    for (const [index, option] of [...listboxElement.children].entries()) {
      const active = index === activeIndex;
      option.setAttribute('aria-selected', String(active));
      option.classList.toggle('is-active', active);
    }

    if (activeIndex === -1) {
      inputElement.removeAttribute('aria-activedescendant');
      return;
    }

    inputElement.setAttribute('aria-activedescendant', optionId(activeIndex));
    listboxElement.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function openList() {
    suggestions = suggestTags(inputElement.value, getAllTags(), tags);

    if (suggestions.length === 0 || tags.length >= MAX_TAGS) {
      closeList();
      return;
    }

    listboxElement.replaceChildren(
      ...suggestions.map((tag, index) => {
        const option = element('li', 'tag-option', tag);
        option.id = optionId(index);
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        /* pointerdown, not click: the input loses focus first on a click, and a blur that
           closes the list takes the option out from under the pointer before it lands. */
        option.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          commit(tag);
        });
        return option;
      })
    );

    listboxElement.hidden = false;
    inputElement.setAttribute('aria-expanded', 'true');
    activeIndex = -1;
    renderActive();
  }

  function changed() {
    renderTokens();
    onChange(getTags());
  }

  function removeAt(index) {
    if (index < 0 || index >= tags.length) {
      return;
    }

    tags.splice(index, 1);
    showError(null);
    changed();
    /* Focus goes back to where the typing happens, not to whichever button slid into the gap:
       taking a tag off is almost always followed by typing another. */
    inputElement.focus();
    openList();
  }

  function commit(value) {
    const tag = String(value ?? '').trim().toLowerCase();

    if (tag === '') {
      return false;
    }

    if (tag.length > TAG_MAX_LENGTH) {
      showError(LENGTH_MESSAGE);
      return false;
    }

    if (tags.length >= MAX_TAGS) {
      showError(COUNT_MESSAGE);
      return false;
    }

    /* Already on the memory: the field just clears, because the tag the reader wanted is
       there. Saying "you already have that" would be true and useless. */
    if (!tags.includes(tag)) {
      tags.push(tag);
      showError(null);
      changed();
    }

    inputElement.value = '';
    closeList();
    return true;
  }

  inputElement.addEventListener('input', () => {
    const value = inputElement.value;

    /* Typing a comma is a commit, wherever it lands. Pasting "trail, rain, ngong" therefore
       takes the lot and leaves whatever followed the last comma in the box.

       The remainder is put back after the commits, not before: commit clears the input, which
       is what it should do for the thing it has just taken, and doing it in the other order
       threw away everything after the last comma. */
    if (value.includes(',')) {
      const parts = value.split(',');
      const remainder = parts.pop();

      for (const part of parts) {
        commit(part);
      }

      inputElement.value = remainder;
    }

    if (errorElement.hidden === false && inputElement.value.length <= TAG_MAX_LENGTH) {
      showError(null);
    }

    openList();
  });

  inputElement.addEventListener('keydown', (event) => {
    const open = !listboxElement.hidden;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (!open) {
        openList();
        if (listboxElement.hidden) {
          return;
        }
      }

      const step = event.key === 'ArrowDown' ? 1 : -1;
      const count = suggestions.length;
      activeIndex = (activeIndex + step + count + (activeIndex === -1 && step === -1 ? 1 : 0)) % count;
      renderActive();
      return;
    }

    if (event.key === 'Enter') {
      /* Always swallowed, open list or not: Enter in this field means "that is a tag", and
         letting it reach the form would submit the memory instead. */
      event.preventDefault();
      commit(activeIndex === -1 ? inputElement.value : suggestions[activeIndex]);
      return;
    }

    if (event.key === 'Tab') {
      /* Only when there is something to commit, so Tab still leaves the field. */
      if (inputElement.value.trim() !== '' || activeIndex !== -1) {
        event.preventDefault();
        commit(activeIndex === -1 ? inputElement.value : suggestions[activeIndex]);
      }
      return;
    }

    if (event.key === 'Escape' && open) {
      /* Stopped here so the dialog does not close as well: the first Escape is for the popup
         that is open over everything, the next one is for the dialog. */
      event.preventDefault();
      event.stopPropagation();
      closeList();
      return;
    }

    if (event.key === 'Backspace' && inputElement.value === '' && tags.length > 0) {
      event.preventDefault();
      removeAt(tags.length - 1);
    }
  });

  inputElement.addEventListener('focus', () => openList());

  inputElement.addEventListener('blur', () => {
    /* Whatever was half typed when the field was left is a tag the reader meant: losing it
       because they reached for Save is the kind of small theft nobody reports. */
    commit(inputElement.value);
    closeList();
  });

  function setTags(next) {
    tags = (Array.isArray(next) ? next : []).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean);
    inputElement.value = '';
    showError(null);
    closeList();
    renderTokens();
  }

  function getTags() {
    return [...tags];
  }

  return {
    setTags,
    getTags,
    /* The form's own error display owns this element on submit, so it needs a way back to a
       clean slate when the dialog is reopened. */
    clearError: () => showError(null),
    closeList,
    focus: () => inputElement.focus()
  };
}
