import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createInstallPrompt } from '../../src/js/ui/install-prompt.js';

function fakeElement({ hidden = false } = {}) {
  const listeners = new Map();

  return {
    hidden,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    fire(type, event) {
      const handler = listeners.get(type);
      if (handler) handler(event);
    }
  };
}

function fakeEvent({ prompt } = {}) {
  return {
    defaultPrevented: false,
    prompted: 0,
    preventDefault() {
      this.defaultPrevented = true;
    },
    prompt() {
      this.prompted += 1;
      return prompt ? prompt() : Promise.resolve({ outcome: 'accepted' });
    }
  };
}

function setup() {
  const section = fakeElement({ hidden: true });
  const button = fakeElement();
  const target = fakeElement();
  const errors = [];

  const api = createInstallPrompt({
    section,
    button,
    target,
    onError: (error) => errors.push(error)
  });

  return { api, section, button, target, errors };
}

test('the section stays hidden where nothing offers an install', () => {
  const { section, api } = setup();

  assert.equal(section.hidden, true);
  assert.equal(api.isOffering(), false);
});

test('the browser offering an install reveals the section', () => {
  const world = setup();
  world.target.fire('beforeinstallprompt', fakeEvent());

  assert.equal(world.section.hidden, false);
  assert.equal(world.api.isOffering(), true);
});

test('the browser default is suppressed, so it does not prompt alongside us', () => {
  const world = setup();
  const event = fakeEvent();
  world.target.fire('beforeinstallprompt', event);

  assert.equal(event.defaultPrevented, true);
});

test('the button prompts with the event the browser handed over', () => {
  const world = setup();
  const event = fakeEvent();
  world.target.fire('beforeinstallprompt', event);
  world.button.fire('click');

  assert.equal(event.prompted, 1);
});

test('clicking before any offer does nothing at all', () => {
  const world = setup();

  assert.doesNotThrow(() => world.button.fire('click'));
  assert.equal(world.section.hidden, true);
});

test('the event is spent after one prompt, so it cannot be fired twice', () => {
  /* A prompted event cannot be prompted again, so holding on to it would leave a button that
     silently does nothing. */
  const world = setup();
  const event = fakeEvent();
  world.target.fire('beforeinstallprompt', event);

  world.button.fire('click');
  world.button.fire('click');

  assert.equal(event.prompted, 1);
  assert.equal(world.section.hidden, true);
});

test('a later offer puts the section back', () => {
  const world = setup();
  world.target.fire('beforeinstallprompt', fakeEvent());
  world.button.fire('click');

  const second = fakeEvent();
  world.target.fire('beforeinstallprompt', second);
  assert.equal(world.section.hidden, false);

  world.button.fire('click');
  assert.equal(second.prompted, 1);
});

test('installing hides the offer, however it was installed', () => {
  /* appinstalled fires for the browser's own menu too, so this is the one place it goes. */
  const world = setup();
  world.target.fire('beforeinstallprompt', fakeEvent());
  world.target.fire('appinstalled');

  assert.equal(world.section.hidden, true);
});

test('an installed app ignores a click that arrives afterwards', () => {
  const world = setup();
  const event = fakeEvent();
  world.target.fire('beforeinstallprompt', event);
  world.target.fire('appinstalled');
  world.button.fire('click');

  assert.equal(event.prompted, 0);
});

test('a prompt that rejects is reported rather than left unhandled', () => {
  const world = setup();
  const failure = new Error('no');
  world.target.fire('beforeinstallprompt', fakeEvent({ prompt: () => Promise.reject(failure) }));
  world.button.fire('click');

  return Promise.resolve().then(() => {
    assert.deepEqual(world.errors, [failure]);
  });
});

test('a prompt that throws outright is reported too', () => {
  const world = setup();
  const failure = new Error('refused');
  world.target.fire('beforeinstallprompt', fakeEvent({ prompt: () => { throw failure; } }));

  assert.doesNotThrow(() => world.button.fire('click'));
  assert.deepEqual(world.errors, [failure]);
});

test('a prompt returning nothing is fine', () => {
  const world = setup();
  world.target.fire('beforeinstallprompt', fakeEvent({ prompt: () => undefined }));

  assert.doesNotThrow(() => world.button.fire('click'));
  assert.deepEqual(world.errors, []);
});
