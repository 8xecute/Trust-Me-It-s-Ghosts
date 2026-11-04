import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changeZoom, toggleRoof, MIN_ZOOM, MAX_ZOOM } from '../src/rendering/view';
test('zoom changes and stays within bounds', () => {
  assert.equal(changeZoom(1, 0.1), 1.1);
  assert.equal(changeZoom(1, -10), MIN_ZOOM);
  assert.equal(changeZoom(1, 10), MAX_ZOOM);
});
test('roof visibility toggles both ways', () => {
  assert.equal(toggleRoof(true), false);
  assert.equal(toggleRoof(false), true);
});
