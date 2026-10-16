import { prefersReducedMotion } from './motion.js';

const COLLAPSED_CLASS = 'is-collapsed';

export function createSidebarToggle({ toggleButton, sidebar, onResize }) {
  let expanded = true;

  function apply() {
    toggleButton.setAttribute('aria-expanded', String(expanded));
    /* The label, not the button: the button also holds an icon, and setting textContent on
       it would remove the icon along with the old words. */
    const label = toggleButton.querySelector('.button-label') ?? toggleButton;
    label.textContent = expanded ? 'Hide list' : 'Show list';
    sidebar.classList.toggle(COLLAPSED_CLASS, !expanded);

    /* A zero-width sidebar is still in the tab order without this, so a collapsed list
       would swallow tab stops the user cannot see. */
    if (expanded) {
      sidebar.removeAttribute('inert');
    } else {
      sidebar.setAttribute('inert', '');
    }
  }

  function toggle() {
    expanded = !expanded;
    apply();

    /* With reduced motion the width change is instant and transitionend never fires,
       so the map is told about its new size here instead. */
    if (prefersReducedMotion()) {
      onResize();
    }
  }

  sidebar.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'width') {
      onResize();
    }
  });

  toggleButton.addEventListener('click', toggle);
  apply();

  return { toggle, isExpanded: () => expanded };
}
