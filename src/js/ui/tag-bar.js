const VISIBLE_LIMIT = 12;

/* Tag text comes from memories the user typed, so it goes in through textContent. */
function buildChip(entry, isSelected, onToggle) {
  const item = document.createElement('li');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tag-chip';
  button.setAttribute('aria-pressed', String(isSelected));

  const label = document.createElement('span');
  label.className = 'tag-chip-label';
  label.textContent = entry.tag;
  button.append(label);

  const count = document.createElement('span');
  count.className = 'tag-chip-count';
  count.textContent = String(entry.count);
  button.append(count);

  button.addEventListener('click', () => onToggle(entry.tag));
  item.append(button);

  return item;
}

export function createTagBar({ container, listElement, toggleElement, onToggleTag, onRequestRender }) {
  let expanded = false;

  function render(counts, selectedTags) {
    const selected = new Set(selectedTags);

    /* A selected tag whose count has fallen to zero stays on screen, otherwise there
       would be no way to switch it off again. */
    const zeroSelected = [...selected]
      .filter((tag) => !counts.some((entry) => entry.tag === tag))
      .map((tag) => ({ tag, count: 0 }));

    const entries = [...counts, ...zeroSelected];

    container.hidden = entries.length === 0;
    if (entries.length === 0) {
      listElement.replaceChildren();
      toggleElement.hidden = true;
      return;
    }

    const overflow = entries.length > VISIBLE_LIMIT;
    const shown = expanded || !overflow ? entries : entries.slice(0, VISIBLE_LIMIT);

    listElement.replaceChildren(
      ...shown.map((entry) => buildChip(entry, selected.has(entry.tag), onToggleTag))
    );

    toggleElement.hidden = !overflow;
    toggleElement.textContent = expanded ? 'Show fewer' : 'Show all ' + entries.length;
    toggleElement.setAttribute('aria-expanded', String(expanded));
  }

  toggleElement.addEventListener('click', () => {
    expanded = !expanded;
    onRequestRender();
  });

  return { render, isExpanded: () => expanded };
}
