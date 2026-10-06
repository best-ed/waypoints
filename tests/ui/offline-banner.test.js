import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createOfflineBanner, OFFLINE_MESSAGE } from '../../src/js/ui/offline-banner.js';

function fakeElement() {
  const listeners = new Map();

  return {
    hidden: true,
    textContent: '',
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    fire(type) {
      const handler = listeners.get(type);
      if (handler) handler();
    }
  };
}

function setup({ online = true } = {}) {
  const banner = fakeElement();
  const text = fakeElement();
  const dismissButton = fakeElement();
  const target = fakeElement();
  let connected = online;

  const api = createOfflineBanner({
    banner,
    text,
    dismissButton,
    target,
    isOnline: () => connected
  });

  return {
    api,
    banner,
    text,
    dismissButton,
    target,
    goOffline() {
      connected = false;
      target.fire('offline');
    },
    goOnline() {
      connected = true;
      target.fire('online');
    }
  };
}

test('nothing is shown while the connection is fine', () => {
  const { banner, text } = setup();

  assert.equal(banner.hidden, true);
  assert.equal(text.textContent, '');
});

test('losing the connection shows the banner with the message', () => {
  const world = setup();
  world.goOffline();

  assert.equal(world.banner.hidden, false);
  assert.equal(world.text.textContent, OFFLINE_MESSAGE);
});

test('a page loaded with no connection shows it straight away', () => {
  /* The offline event never fired - the page was already offline before anything was
     listening - so the state has to be read at startup too. */
  const { banner, text } = setup({ online: false });

  assert.equal(banner.hidden, false);
  assert.equal(text.textContent, OFFLINE_MESSAGE);
});

test('coming back online hides it and empties the region', () => {
  const world = setup();
  world.goOffline();
  world.goOnline();

  assert.equal(world.banner.hidden, true);
  assert.equal(world.text.textContent, '');
});

test('dismissing hides it', () => {
  const world = setup();
  world.goOffline();
  world.dismissButton.fire('click');

  assert.equal(world.banner.hidden, true);
  assert.equal(world.text.textContent, '');
});

test('a dismissed banner stays away for the rest of that outage', () => {
  const world = setup();
  world.goOffline();
  world.dismissButton.fire('click');
  world.target.fire('offline');

  assert.equal(world.banner.hidden, true);
});

test('a new outage after reconnecting shows it again', () => {
  /* The connection dropping again is new information, not the notice already waved away. */
  const world = setup();
  world.goOffline();
  world.dismissButton.fire('click');
  world.goOnline();
  world.goOffline();

  assert.equal(world.banner.hidden, false);
  assert.equal(world.text.textContent, OFFLINE_MESSAGE);
});

test('the message says what still works before what does not', () => {
  const works = OFFLINE_MESSAGE.indexOf('memories are here');
  const doesNot = OFFLINE_MESSAGE.indexOf('need a connection');

  assert.ok(works > -1 && doesNot > -1);
  assert.ok(works < doesNot, 'the reassurance has to come first');
});

test('the message is plain text with no markup in it', () => {
  assert.doesNotMatch(OFFLINE_MESSAGE, /[<>]/);
});

test('isShowing reports what the banner is doing', () => {
  const world = setup();

  assert.equal(world.api.isShowing(), false);
  world.goOffline();
  assert.equal(world.api.isShowing(), true);
});
