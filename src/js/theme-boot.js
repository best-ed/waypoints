/* Runs in <head>, before the stylesheets, as a classic script rather than a module: a module
   is deferred by definition, which would mean a flash of the light theme before the dark one
   landed. This is the one script in the project that is not an ES module, and the only one
   that may run before main.js.

   It cannot import, so the settings key scheme is repeated here rather than shared. That
   duplication is deliberate and tested: tests/style/theme-boot.test.js reads this file and
   asserts both keys match the ones dev/sandbox.js hands out.

   Nothing in here may throw. localStorage access alone throws outright when site data is
   blocked, and a theme preference is never worth stopping the page from loading. */
(function () {
  try {
    var sandbox = /[?&]sandbox(?:[=&]|$)/.test(window.location.search);
    var key = sandbox ? 'waypoints:sandbox:settings' : 'waypoints:settings';

    var raw = window.localStorage.getItem(key);
    if (!raw) {
      return;
    }

    var theme = JSON.parse(raw).theme;

    /* Only an explicit choice is written. "system" means no attribute, which leaves the media
       query in tokens.css to decide. */
    if (theme === 'light' || theme === 'dark') {
      document.documentElement.setAttribute('data-theme', theme);
    }
  } catch (error) {
    /* Junk in the key, blocked storage, a half-written value: the media query default is a
       perfectly good outcome for all of them. */
  }
})();
